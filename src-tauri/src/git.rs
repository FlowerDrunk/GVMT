use crate::command_exec::{run_command, run_command_args};
use crate::file_browser::normalize_relative_path;
use crate::models::{ChangeItem, CommitFileRequest, OperationResult};
use crate::utils::{failed_operation, slice_from_char, success_operation};
use serde::Serialize;

pub fn git_status_changes(path: &str) -> Result<Vec<ChangeItem>, String> {
    let output = run_command(["git", "-C", path, "status", "--porcelain=v1"])?;
    Ok(output
        .lines()
        .filter_map(parse_git_status_line)
        .collect::<Vec<_>>())
}

pub fn parse_git_status_line(line: &str) -> Option<ChangeItem> {
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

    Some(ChangeItem {
        path,
        status: git_status_kind(&status_code).to_string(),
        vcs_type: "git".to_string(),
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
    let diff = run_command(["git", "-C", root_path, "diff", "HEAD", "--", relative_path])
        .or_else(|_| run_command(["git", "-C", root_path, "diff", "--", relative_path]))?;
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
    // Try git fetch --dry-run first (more reliable)
    match run_command(["git", "-C", path, "fetch", "--dry-run", "origin"]) {
        Ok(output) => {
            let trimmed = output.trim();
            Ok(!trimmed.is_empty())
        }
        Err(_) => {
            // Fallback: compare local HEAD with remote HEAD using ls-remote
            let local_head = run_command(["git", "-C", path, "rev-parse", "HEAD"])?;
            let branch = run_command(["git", "-C", path, "rev-parse", "--abbrev-ref", "HEAD"])?
                .trim()
                .to_string();
            if branch == "HEAD" {
                return Ok(false); // detached HEAD, skip
            }
            let remote_ref = run_command_args("git", &[
                "ls-remote".into(),
                "origin".into(),
                format!("refs/heads/{branch}"),
            ])?;
            let remote_sha = remote_ref.split_whitespace().next().unwrap_or("");
            if remote_sha.is_empty() {
                return Ok(false);
            }
            // If local HEAD matches remote HEAD, no updates
            let local_trimmed = local_head.trim();
            Ok(local_trimmed != remote_sha)
        }
    }
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
    let output = match run_command(["git", "-C", root_path, "ls-files", "-v"]) {
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
