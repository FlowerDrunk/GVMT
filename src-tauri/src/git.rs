use crate::command_exec::{run_command, run_command_args};
use crate::file_browser::normalize_relative_path;
use crate::models::{ChangeItem, CloneProgressStats, CommitFileRequest, OperationResult};
use crate::utils::{failed_operation, slice_from_char, success_operation};
use serde::Serialize;
use tauri::Emitter;

pub fn git_status_changes(path: &str) -> Result<Vec<ChangeItem>, String> {
    let output = run_command(["git", "-C", path, "-c", "core.quotePath=false", "status", "--porcelain=v1"])?;
    Ok(output
        .lines()
        .filter_map(|line| parse_git_status_line(line, path))
        .collect::<Vec<_>>())
}

pub fn parse_git_status_line(line: &str, root_path: &str) -> Option<ChangeItem> {
    if line.chars().count() < 2 {
        return None;
    }

    let mut chars = line.chars();
    let index_status = chars.next()?;
    let worktree_status = chars.next()?;
    let status_code = format!("{index_status}{worktree_status}");
    let raw_path = status_path_after_git_status(line);

    // For renamed files ("R  old -> new"), take the new name
    let path = raw_path
        .rsplit(" -> ")
        .next()
        .unwrap_or(raw_path)
        .trim_matches('"')
        .to_string();

    if path.is_empty() {
        return None;
    }

    // 暂存区有变更：索引列不是空格且不是 ?（未跟踪）
    let staged = index_status != ' ' && index_status != '?';

    let abs = format!("{}/{}", root_path.trim_end_matches('/').trim_end_matches('\\'), path);

    Some(ChangeItem {
        path,
        status: git_status_kind(&status_code).to_string(),
        vcs_type: "git".to_string(),
        staged,
        is_dir: std::path::Path::new(&abs).is_dir(),
    })
}

pub fn status_path_after_git_status(line: &str) -> &str {
    let after_status = slice_from_char(line, 2).unwrap_or("").trim_start();
    if let Some(after_separator) = slice_from_char(line, 3) {
        let fixed_width = after_separator.trim_start();
        if fixed_width.is_empty() || fixed_width == after_status {
            return after_status;
        }
        if after_status.ends_with(fixed_width) && after_status.len() == fixed_width.len() + 1 {
            return after_status;
        }
        return fixed_width;
    }
    after_status
}

pub fn git_status_kind(status_code: &str) -> &'static str {
    if status_code.contains('U') || status_code == "AA" || status_code == "DD" {
        "conflicted"
    } else if status_code == "??" {
        "untracked"
    } else if status_code.contains('R') {
        "renamed"
    } else if status_code.contains('A') {
        "added"
    } else if status_code.contains('D') {
        "deleted"
    } else if status_code.contains('M') {
        "modified"
    } else {
        "unknown"
    }
}

pub fn git_file_diff(root_path: &str, relative_path: &str) -> Result<String, String> {
    let diff = run_command(["git", "-C", root_path, "-c", "core.quotePath=false", "diff", "HEAD", "--", relative_path])
        .or_else(|_| run_command(["git", "-C", root_path, "-c", "core.quotePath=false", "diff", "--", relative_path]))?;
    Ok(if diff.trim().is_empty() {
        "当前文件没有可展示的 Git diff，可能是仅属性变化或文件内容尚未加入跟踪。".to_string()
    } else {
        diff
    })
}

pub fn git_commit_results(
    root_path: &str,
    message: &str,
    push: bool,
    files: &[CommitFileRequest],
) -> Vec<OperationResult> {
    let mut results = Vec::new();
    let normalized_paths = match normalized_commit_paths(files) {
        Ok(paths) => paths,
        Err(error) => {
            results.push(failed_operation("commit", "git", error, false));
            return results;
        }
    };

    // 过滤掉已被 .gitignore 忽略的未跟踪文件；已跟踪文件不受 .gitignore 影响
    let tracked_paths: Vec<String> = normalized_paths.into_iter().filter(|path| {
        let check = run_command_args("git", &[
            "-C".into(),
            root_path.to_string(),
            "check-ignore".into(),
            "-q".into(),
            path.to_string(),
        ]);
        check.is_err() // exit code != 0 表示未被忽略，保留
    }).collect();

    if tracked_paths.is_empty() {
        results.push(failed_operation(
            "commit",
            "git",
            "所有选择的文件已被 .gitignore 忽略，无需提交".to_string(),
            false,
        ));
        return results;
    }

    let mut add_args = vec![
        "-C".to_string(),
        root_path.to_string(),
        "add".to_string(),
        "--".to_string(),
    ];
    add_args.extend(tracked_paths.iter().cloned());
    if let Err(error) = run_command_args("git", &add_args) {
        // 如果 git add 失败是因为 CRLF 警告，自动设置 core.autocrlf false 后重试
        if error.to_lowercase().contains("crlf")
            || error.to_lowercase().contains("lf will be replaced")
        {
            let _ = run_command_args("git", &[
                "-C".into(),
                root_path.to_string(),
                "config".into(),
                "core.autocrlf".into(),
                "false".into(),
            ]);
            // 重试 add
            if let Err(retry_error) = run_command_args("git", &add_args) {
                results.push(failed_operation(
                    "commit",
                    "git",
                    format!("Git add 失败：{retry_error}"),
                    false,
                ));
                return results;
            }
        } else {
            results.push(failed_operation(
                "commit",
                "git",
                format!("Git add 失败：{error}"),
                false,
            ));
            return results;
        }
    }

    let mut commit_args = vec![
        "-C".to_string(),
        root_path.to_string(),
        "commit".to_string(),
        "-m".to_string(),
        message.to_string(),
        "--".to_string(),
    ];
    commit_args.extend(tracked_paths.iter().cloned());
    match run_command_args("git", &commit_args) {
        Ok(output) => results.push(success_operation("commit", "git", "Git 提交完成", output)),
        Err(error) => {
            results.push(failed_operation(
                "commit",
                "git",
                format!("Git 提交失败：{error}"),
                false,
            ));
            return results;
        }
    }

    if push {
        let push_args = vec!["-C".to_string(), root_path.to_string(), "push".to_string()];
        match run_command_args("git", &push_args) {
            Ok(output) => results.push(success_operation("push", "git", "Git push 完成", output)),
            Err(error) => results.push(failed_operation(
                "push",
                "git",
                format!("Git push 失败：{error}"),
                false,
            )),
        }
    }

    results
}

pub fn git_update_result(path: &str) -> OperationResult {
    match run_command(["git", "-C", path, "pull", "--ff-only"]) {
        Ok(output) => OperationResult {
            operation: "update".to_string(),
            vcs_type: "git".to_string(),
            success: true,
            summary: if output.contains("Already up to date")
                || output.contains("Already up-to-date")
            {
                "Git 已是最新".to_string()
            } else {
                "Git 更新完成".to_string()
            },
            output,
            warning: None,
            missing_svn_cli: false,
        },
        Err(error) => OperationResult {
            operation: "update".to_string(),
            vcs_type: "git".to_string(),
            success: false,
            summary: "Git 更新失败".to_string(),
            output: String::new(),
            warning: Some(git_update_warning(&error)),
            missing_svn_cli: false,
        },
    }
}

pub fn git_update_warning(error: &str) -> String {
    if error.contains("Not possible to fast-forward") || error.contains("divergent") {
        "Git 无法快进更新，请先检查本地提交或分支分叉情况。".to_string()
    } else if error.contains("Your local changes") {
        "Git 更新前��要先处理本地修改。".to_string()
    } else {
        format!("Git 更新失败：{error}")
    }
}

/// 单独执行 git push，用于提交成功但 push 失败后的重试
pub fn git_push_only(root_path: &str) -> OperationResult {
    let push_args = vec!["-C".to_string(), root_path.to_string(), "push".to_string()];
    match run_command_args("git", &push_args) {
        Ok(output) => success_operation("push", "git", "Git push 完成", output),
        Err(error) => failed_operation(
            "push",
            "git",
            format!("Git push 失败：{error}"),
            false,
        ),
    }
}

// ── Git Stash ────────────────────────────────────────────────────────────

pub fn git_stash_push(root_path: &str, message: Option<&str>) -> OperationResult {
    let mut args = vec!["-C".to_string(), root_path.to_string(), "stash".to_string(), "push".to_string()];
    if let Some(msg) = message {
        args.push("-m".to_string());
        args.push(msg.to_string());
    }
    match run_command_args("git", &args) {
        Ok(output) => success_operation("stash", "git", "Git stash 保存完成", output),
        Err(error) => failed_operation("stash", "git", format!("Git stash 保存失败：{error}"), false),
    }
}

pub fn git_stash_pop(root_path: &str) -> OperationResult {
    match run_command_args("git", &["-C".into(), root_path.to_string(), "stash".into(), "pop".into()]) {
        Ok(output) => success_operation("stash", "git", "Git stash 恢复完成", output),
        Err(error) => failed_operation("stash", "git", format!("Git stash 恢复失败：{error}"), false),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStashEntry {
    pub index: usize,
    pub message: String,
}

pub fn git_stash_list(root_path: &str) -> Result<Vec<GitStashEntry>, String> {
    let output = run_command(["git", "-C", root_path, "stash", "list"])?;
    Ok(output
        .lines()
        .filter_map(|line| {
            // Format: "stash@{0}: On branch: message"
            let line = line.trim();
            if line.is_empty() {
                return None;
            }
            // Extract index
            let index = if let Some(start) = line.find("stash@{") {
                let rest = &line[start + 7..];
                if let Some(end) = rest.find('}') {
                    rest[..end].parse::<usize>().ok()
                } else {
                    None
                }
            } else {
                None
            }?;

            // Extract message (after ": ")
            let message = if let Some(pos) = line.find(": ") {
                line[pos + 2..].to_string()
            } else {
                line.to_string()
            };

            Some(GitStashEntry { index, message })
        })
        .collect())
}

pub fn git_stash_drop(root_path: &str, index: usize) -> OperationResult {
    let args = vec![
        "-C".to_string(),
        root_path.to_string(),
        "stash".to_string(),
        "drop".to_string(),
        format!("stash@{{{index}}}"),
    ];
    match run_command_args("git", &args) {
        Ok(output) => success_operation("stash", "git", "Git stash 丢弃完成", output),
        Err(error) => failed_operation("stash", "git", format!("Git stash 丢弃失败：{error}"), false),
    }
}

// ── Git Log ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitLog {
    pub hash: String,
    pub author: String,
    pub date: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetail {
    pub hash: String,
    pub author: String,
    pub date: String,
    pub message: String,
    pub files: Vec<CommitFileChange>,
    pub diff: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitFileChange {
    pub path: String,
    pub change_type: String,
}

pub fn git_log(root_path: &str, max_count: usize) -> Result<Vec<GitCommitLog>, String> {
    let output = run_command_args(
        "git",
        &[
            "-C".into(),
            root_path.to_string(),
            "log".into(),
            format!("--max-count={max_count}"),
            "--format=%h|%an|%ai|%s".into(),
        ],
    )?;

    Ok(output
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }
            let mut parts = line.splitn(4, '|');
            let hash = parts.next()?.to_string();
            let author = parts.next()?.to_string();
            let date = parts.next()?.to_string();
            let message = parts.next().unwrap_or("").to_string();

            Some(GitCommitLog {
                hash,
                author,
                date,
                message,
            })
        })
        .collect())
}

pub fn git_show_detail(root_path: &str, hash: &str) -> Result<CommitDetail, String> {
    // Get changed files with stats
    let files_output = run_command(["git", "-C", root_path, "-c", "core.quotePath=false", "diff-tree", "--no-commit-id", "-r", "--name-status", hash])?;
    let files: Vec<CommitFileChange> = files_output
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() { return None; }
            let mut parts = line.splitn(2, '\t');
            let code = parts.next()?;
            let path = parts.next()?.to_string();
            let change_type = match code {
                "A" => "added",
                "M" => "modified",
                "D" => "deleted",
                "R" => "renamed",
                _ => "modified",
            }.to_string();
            Some(CommitFileChange { path, change_type })
        })
        .collect();

    // Get full diff — use `git show` which works for all commit types
    let diff = run_command(["git", "-C", root_path, "-c", "core.quotePath=false", "show", "--patch", "--stat", hash])
        .unwrap_or_default();

    // Get commit metadata
    let info = run_command_args("git", &[
        "-C".into(), root_path.to_string(),
        "log".into(), "--format=%an|%ai|%s".into(), "-n".into(), "1".into(), hash.to_string(),
    ])?;
    let mut meta_parts = info.trim().splitn(3, '|');
    let author = meta_parts.next().unwrap_or("").to_string();
    let date = meta_parts.next().unwrap_or("").to_string();
    let message = meta_parts.next().unwrap_or("").to_string();

    Ok(CommitDetail {
        hash: hash.to_string(),
        author,
        date,
        message,
        files,
        diff,
    })
}

// ── Git Fetch ────────────────────────────────────────────────────────────

pub fn git_fetch(root_path: &str) -> OperationResult {
    match run_command(["git", "-C", root_path, "fetch", "--prune"]) {
        Ok(output) => success_operation("fetch", "git", "Git fetch 完成", output),
        Err(error) => failed_operation("fetch", "git", format!("Git fetch 失败：{error}"), false),
    }
}

// ── Git Reset ────────────────────────────────────────────────────────────

pub fn git_reset(root_path: &str, mode: &str, target: &str) -> OperationResult {
    let mode_flag = match mode {
        "soft" => "--soft",
        "mixed" => "--mixed",
        "hard" => "--hard",
        _ => "--mixed",
    };
    let args = vec![
        "-C".into(),
        root_path.to_string(),
        "reset".into(),
        mode_flag.into(),
        target.to_string(),
    ];
    match run_command_args("git", &args) {
        Ok(output) => success_operation(
            "reset",
            "git",
            format!("Git reset ({mode}) 完成: {target}").as_str(),
            output,
        ),
        Err(error) => failed_operation("reset", "git", format!("Git reset 失败：{error}"), false),
    }
}

pub fn git_has_remote_updates(path: &str) -> Result<bool, String> {
    // Compare local HEAD hash against remote HEAD hash via ls-remote.
    // This is more reliable than `git fetch --dry-run` which can produce
    // false positives from negotiation output.
    let local_head = run_command(["git", "-C", path, "rev-parse", "HEAD"])?
        .trim()
        .to_string();
    if local_head.is_empty() {
        return Ok(false);
    }

    let branch = run_command(["git", "-C", path, "rev-parse", "--abbrev-ref", "HEAD"])?
        .trim()
        .to_string();
    if branch == "HEAD" {
        return Ok(false); // detached HEAD, can't compare
    }

    let remote_ref = match run_command_args("git", &[
        "ls-remote".into(),
        "origin".into(),
        format!("refs/heads/{branch}"),
    ]) {
        Ok(output) => output,
        Err(_) => return Ok(false),
    };

    let remote_sha = remote_ref.split_whitespace().next().unwrap_or("");
    if remote_sha.is_empty() {
        return Ok(false);
    }

    Ok(local_head != remote_sha)
}


fn normalized_commit_paths(files: &[CommitFileRequest]) -> Result<Vec<String>, String> {
    files
        .iter()
        .map(|file| normalize_relative_path(&file.path))
        .collect::<Result<Vec<_>, _>>()
}

// ── Git Skip-Worktree ─────────────────────────────────────────────────────

pub fn git_is_tracked(root_path: &str, relative_path: &str) -> bool {
    run_command_args("git", &[
        "-C".into(),
        root_path.to_string(),
        "ls-files".into(),
        "--error-unmatch".into(),
        relative_path.to_string(),
    ]).is_ok()
}

pub fn git_set_skip_worktree(root_path: &str, relative_path: &str) -> Result<String, String> {
    run_command_args("git", &[
        "-C".into(),
        root_path.to_string(),
        "update-index".into(),
        "--skip-worktree".into(),
        relative_path.to_string(),
    ])
}

pub fn git_unset_skip_worktree(root_path: &str, relative_path: &str) -> Result<String, String> {
    run_command_args("git", &[
        "-C".into(),
        root_path.to_string(),
        "update-index".into(),
        "--no-skip-worktree".into(),
        relative_path.to_string(),
    ])
}

pub fn git_list_skip_worktree(root_path: &str) -> Vec<String> {
    // git ls-files -v 输出格式：第一列是标志位，S 表示 skip-worktree
    let output = match run_command(["git", "-C", root_path, "-c", "core.quotePath=false", "ls-files", "-v"]) {
        Ok(o) => o,
        Err(_) => return Vec::new(),
    };
    output
        .lines()
        .filter(|line| line.starts_with('S'))
        .filter_map(|line| {
            // 去掉标志位和空格，提取路径
            let path = line[1..].trim();
            if path.is_empty() { None } else { Some(path.to_string()) }
        })
        .collect()
}

/// Extract progress percentage from git progress lines like:
/// "Receiving objects: 45% (123/456)" → Some(45)
/// "Resolving deltas: 80% (160/200)" → Some(80)
fn parse_progress_percent(line: &str) -> Option<u8> {
    let pct_start = line.find(|c: char| c == '%' || c.is_ascii_digit())?;
    let after = &line[pct_start..];
    let pct_end = after.find('%')?;
    let num_str = &after[..pct_end];
    let digits: String = num_str.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() || digits.len() > 3 { return None; }
    digits.parse::<u8>().ok()
}

/// Parse size and speed from git progress lines like:
/// "Receiving objects: 45% (123/456), 1.23 MiB | 500.00 KiB/s"
/// Returns (size_in_mb, speed_in_kbps) if both are found.
fn parse_git_progress_size_speed(line: &str) -> Option<(f64, f64)> {
    // Look for pattern: "X.XX MiB" or similar size indication
    let pipe_pos = line.find(" | ")?;
    let before_pipe = &line[..pipe_pos];
    let after_pipe = &line[pipe_pos + 3..];

    // Parse size before pipe: ", 1.23 MiB"
    let size_str = before_pipe.rsplit(',').next()?.trim();
    let (size_val, unit) = size_str.split_once(' ')?;
    let size_num: f64 = size_val.parse().ok()?;
    let size_mb = match unit.trim() {
        "GiB" => size_num * 1024.0,
        "MiB" => size_num,
        "KiB" => size_num / 1024.0,
        _ => return None,
    };

    // Parse speed after pipe: "500.00 KiB/s"
    let speed_str = after_pipe.trim();
    let (speed_val, rest) = speed_str.split_once(' ')?;
    let speed_num: f64 = speed_val.parse().ok()?;
    let speed_kbps = match rest.trim() {
        "MiB/s" => speed_num * 1024.0,
        "KiB/s" => speed_num,
        _ => return None,
    };

    Some((size_mb, speed_kbps))
}

pub fn git_reset_file(root_path: &str, relative_path: &str) -> OperationResult {
    match run_command_args("git", &[
        "-C".into(),
        root_path.to_string(),
        "reset".into(),
        "HEAD".into(),
        "--".into(),
        relative_path.to_string(),
    ]) {
        Ok(output) => success_operation("unstage", "git", &format!("已取消暂存：{relative_path}"), output),
        Err(error) => failed_operation("unstage", "git", format!("取消暂存失败：{error}"), false),
    }
}

// ── Git Clone (streaming) ─────────────────────────────────────────────────

pub fn git_clone_streaming(
    app: &tauri::AppHandle,
    url: &str,
    path: &str,
    shallow: bool,
) -> OperationResult {
    use crate::command_exec::{new_command, resolve_program};
    use std::io::BufRead;

    let resolved = resolve_program("git");
    let mut args: Vec<String> = vec!["clone".into(), "--progress".into()];
    if shallow {
        args.push("--depth".into());
        args.push("1".into());
        args.push("--single-branch".into());
    }
    args.push(url.to_string());
    args.push(path.to_string());
    let mut child = match new_command(&resolved)
        .args(&args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            return OperationResult {
                operation: "clone".to_string(),
                vcs_type: "git".to_string(),
                success: false,
                summary: "Git clone 启动失败".to_string(),
                output: String::new(),
                warning: Some(e.to_string()),
                missing_svn_cli: false,
            };
        }
    };

    crate::command_exec::set_running_pid(child.id());
    let _ = app.emit("clone-progress-line", "── 正在克隆仓库 ──");

    let mut full_output = String::new();
    // git clone outputs progress to stderr
    if let Some(stderr) = child.stderr.take() {
        let reader = std::io::BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(text) = line {
                // Parse progress percentage for progress bar
                if let Some(pct) = parse_progress_percent(&text) {
                    let _ = app.emit("clone-progress-pct", pct);
                }
                // Parse size and speed for stats display
                if let Some((size_mb, speed_kbps)) = parse_git_progress_size_speed(&text) {
                    let stats = CloneProgressStats {
                        files: 0,
                        size_mb: Some(size_mb),
                        speed_kbps: Some(speed_kbps),
                    };
                    let _ = app.emit("clone-progress-stats", &stats);
                }
                let _ = app.emit("clone-progress-line", &text);
                full_output.push_str(&text);
                full_output.push('\n');
            }
        }
    }

    let status = child.wait().unwrap_or_default();
    crate::command_exec::clear_running_pid();

    // Also read stdout for completion
    if let Some(stdout) = child.stdout.take() {
        let _ = std::io::read_to_string(stdout);
    }

    if status.success() {
        success_operation("clone", "git", "Git clone 完成", full_output)
    } else {
        failed_operation("clone", "git", format!("Git clone 失败：{full_output}"), false)
    }
}
