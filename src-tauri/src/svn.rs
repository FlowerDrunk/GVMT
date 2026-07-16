use crate::command_exec::{new_command, os_str_to_string, run_command, run_command_args};
use tauri::Emitter;
use crate::file_browser::normalize_relative_path;
use crate::models::{ChangeItem, CloneProgressStats, CommitFileRequest, OperationResult, SvnMetadata};
use crate::utils::{failed_operation, success_operation};
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use std::io::{BufRead, Read};
use std::path::{Path, PathBuf};

pub fn svn_info(path: &str) -> Result<String, String> {
    run_command(["svn", "info", path])
}

pub fn detect_svn_metadata(
    path: &str,
    repository_path: &Path,
) -> Result<SvnMetadata, String> {
    // Try to get HEAD revision from server first (network required)
    let head_revision = run_command(["svn", "info", "-r", "HEAD", path])
        .ok()
        .and_then(|info| parse_svn_info_item(&info, "Revision"));

    match svn_info(path) {
        Ok(info) => Ok(SvnMetadata {
            remote_url: parse_svn_info_item(&info, "URL"),
            revision: head_revision.or_else(|| parse_svn_info_item(&info, "Revision")),
        }),
        Err(_) => {
            let wc = detect_svn_metadata_from_wc_db(repository_path)?;
            Ok(SvnMetadata {
                revision: head_revision.or(wc.revision),
                ..wc
            })
        }
    }
}

pub fn parse_svn_info_item(info: &str, label: &str) -> Option<String> {
    let prefix = format!("{label}:");
    info.lines().find_map(|line| {
        line.strip_prefix(&prefix)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
    })
}

fn run_svn_status(path: &str) -> Result<String, String> {
    crate::command_exec::run_command(["svn", "status", path])
}

pub fn svn_status_changes(path: &str) -> Result<Vec<ChangeItem>, String> {
    let output = match run_svn_status(path) {
        Ok(o) => o,
        Err(e) if is_svn_locked_error(&e) => {
            // Auto-recover: try cleanup, then retry status once
            let _ = run_command_args("svn", &["cleanup".into(), path.to_string()]);
            run_svn_status(path)?
        }
        Err(e) => return Err(e),
    };
    let patterns = load_svnignore_patterns(path);
    Ok(output
        .lines()
        .filter_map(|line| parse_svn_status_line(line, path))
        .filter(|change| {
            // 过滤 .svnignore 文件本身
            if change.path == ".svnignore" {
                return false;
            }
            // 过滤 SVN 冲突产生的辅助文件 (.mine, .rXXXX)
            if is_svn_conflict_artifact(&change.path) {
                return false;
            }
            // 过滤匹配 .svnignore 规则的文件（冲突文件始终显示）
            change.status == "conflicted" || !is_ignored_by_svnignore(&change.path, &patterns)
        })
        .collect::<Vec<_>>())
}

/// SVN 冲突产生的辅助文件：.mine（本地版本）和 .rXXXX（指定版本）
fn is_svn_conflict_artifact(path: &str) -> bool {
    let name = std::path::Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    if name.ends_with(".mine") { return true; }
    // 匹配 filename.ext.rNNNN — 至少 4 位数字的 revision 号
    if let Some(rest) = name.rfind(".r") {
        let suffix = &name[rest + 2..];
        if suffix.len() >= 4 && suffix.chars().all(|c| c.is_ascii_digit()) {
            return true;
        }
    }
    false
}

/// 从仓库根目录加载 .svnignore 中的忽略模式
fn load_svnignore_patterns(root_path: &str) -> Vec<String> {
    let svnignore = Path::new(root_path).join(".svnignore");
    if !svnignore.exists() {
        return Vec::new();
    }
    std::fs::read_to_string(&svnignore)
        .unwrap_or_default()
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .collect()
}

/// 检查文件路径是否匹配 .svnignore 中的任何模式
fn is_ignored_by_svnignore(change_path: &str, patterns: &[String]) -> bool {
    if patterns.is_empty() {
        return false;
    }
    let normalized = change_path.replace('\\', "/");
    patterns.iter().any(|pattern| {
        let p = pattern.trim();
        if p.is_empty() || p.starts_with('#') {
            return false;
        }
        // 目录尾部 / 匹配所有子路径
        if p.ends_with('/') {
            return normalized == p.trim_end_matches('/')
                || normalized.starts_with(&format!("{}/", p.trim_end_matches('/')));
        }
        // 支持 glob 通配符（*.pdb, build/*, ? 等）
        if p.contains('*') || p.contains('?') {
            return svnignore_glob_match(&normalized, p);
        }
        // 精确匹配文件名或路径
        normalized == *p || normalized.ends_with(&format!("/{p}"))
    })
}

/// 简单 glob 匹配：支持 *（匹配一段非 / 字符）和 ?（匹配一个非 / 字符）
fn svnignore_glob_match(path: &str, pattern: &str) -> bool {
    let path_segments: Vec<&str> = path.split('/').collect();
    let pattern_segments: Vec<&str> = pattern.split('/').collect();

    // 如果 pattern 包含 /，则从路径起始匹配；否则只匹配文件名
    if pattern.contains('/') {
        segments_match(&path_segments, &pattern_segments)
    } else {
        // 无斜杠的 pattern（如 *.pdb）匹配任何层级的文件名
        path_segments.iter().any(|seg| segments_match(&[seg], &pattern_segments))
    }
}

fn segments_match(segments: &[&str], pattern: &[&str]) -> bool {
    if segments.len() != pattern.len() {
        // 当 pattern 是纯 * 时匹配任意非空段
        if pattern.len() == 1 && pattern[0] == "*" {
            return !segments.is_empty();
        }
        return false;
    }
    segments.iter().zip(pattern.iter()).all(|(seg, pat)| {
        if *pat == "*" {
            return true;
        }
        if pat.contains('*') || pat.contains('?') {
            return simple_wildcard_match(seg, pat);
        }
        seg == pat
    })
}

fn simple_wildcard_match(text: &str, pattern: &str) -> bool {
    let t: Vec<char> = text.chars().collect();
    let p: Vec<char> = pattern.chars().collect();
    let mut ti = 0;
    let mut pi = 0;
    let mut star_ti = 0usize;
    let mut star_pi = 0usize;
    let mut has_star = false;

    while ti < t.len() {
        if pi < p.len() && (p[pi] == t[ti] || p[pi] == '?') {
            ti += 1;
            pi += 1;
        } else if pi < p.len() && p[pi] == '*' {
            star_ti = ti;
            star_pi = pi;
            has_star = true;
            pi += 1;
        } else if has_star {
            ti = star_ti + 1;
            star_ti = ti;
            pi = star_pi + 1;
        } else {
            return false;
        }
    }
    while pi < p.len() && p[pi] == '*' {
        pi += 1;
    }
    pi == p.len()
}

pub fn parse_svn_status_line(line: &str, root_path: &str) -> Option<ChangeItem> {
    let status_code = line.chars().next()?;
    if line.trim().is_empty() {
        return None;
    }
    // SVN status 第一列只能是这些有效状态码，其他字符（如 "Summary of conflicts:" 首字符 'S'）是汇总行，应过滤
    if !matches!(status_code, 'A' | 'C' | 'D' | 'M' | 'R' | '?' | '!' | '~' | 'I' | 'X' | 'E' | 'L' | ' ') {
        return None;
    }
    // SVN status 行固定为 8 字符头部 + 路径；第 8 列（index 7）必须是空格分隔符，否则不是文件条目
    if line.as_bytes().get(7) != Some(&b' ') {
        return None;
    }

    let path = status_path_after_svn_status(line);
    if path.is_empty() {
        return None;
    }

    let rel = repository_relative_change_path(path, root_path);
    let abs = format!("{}/{}", root_path.trim_end_matches('/').trim_end_matches('\\'), rel);

    Some(ChangeItem {
        path: rel,
        status: svn_status_kind(status_code).to_string(),
        vcs_type: "svn".to_string(),
        staged: false,
        is_dir: std::path::Path::new(&abs).is_dir(),
    })
}

pub fn status_path_after_svn_status(line: &str) -> &str {
    // SVN status line format: <1-char status><6-char columns><space><path>
    // The status columns are always 8 chars wide total, so path starts at position 8
    if let Some(path) = line.get(8..) {
        return path.trim_start();
    }
    line.get(1..).unwrap_or("").trim_start()
}

pub fn svn_status_kind(status_code: char) -> &'static str {
    match status_code {
        'A' => "added",
        'M' => "modified",
        'D' => "deleted",
        'R' => "renamed",
        '?' => "untracked",
        '!' => "missing",
        'C' | '~' => "conflicted",
        _ => "unknown",
    }
}

pub fn svn_file_diff(root_path: &str, relative_path: &str) -> Result<String, String> {
    let target_path =
        Path::new(root_path).join(relative_path.replace('/', std::path::MAIN_SEPARATOR_STR));
    let target = os_str_to_string(target_path.as_os_str());
    let diff = run_command(["svn", "diff", &target])?;
    Ok(if diff.trim().is_empty() {
        "当前文件没有可展示的 SVN diff，可能是仅属性变化或文件内容尚未加入版本控制。".to_string()
    } else {
        diff
    })
}

pub fn svn_commit_result(
    root_path: &str,
    message: &str,
    files: &[CommitFileRequest],
) -> OperationResult {
    // 排除 .svnignore 自身
    let files: Vec<_> = files.iter().filter(|f| f.path != ".svnignore").cloned().collect();
    if files.is_empty() {
        return success_operation("commit", "svn", "SVN 无可提交文件（.svnignore 被排除）", String::new());
    }

    let normalized_paths = match normalized_commit_paths(&files) {
        Ok(paths) => paths,
        Err(error) => return failed_operation("commit", "svn", error, false),
    };

    for file in files.iter().filter(|file| file.status == "untracked") {
        match svn_absolute_path(root_path, &file.path) {
            Ok(path) => {
                let args = vec!["add".to_string(), path];
                if let Err(error) = run_command_args("svn", &args) {
                    return failed_operation(
                        "commit",
                        "svn",
                        svn_failure_warning("add", &error),
                        false,
                    );
                }
            }
            Err(error) => return failed_operation("commit", "svn", error, false),
        }
    }

    let mut commit_args = vec!["commit".to_string(), "-m".to_string(), message.to_string()];
    for path in normalized_paths {
        match svn_absolute_path(root_path, &path) {
            Ok(path) => commit_args.push(path),
            Err(error) => return failed_operation("commit", "svn", error, false),
        }
    }

    match run_command_args("svn", &commit_args) {
        Ok(output) => success_operation("commit", "svn", "SVN 提交完成", output),
        Err(error) => {
            // E155011: file is out of date — need to update first, then retry
            if is_svn_out_of_date_error(&error) {
                match svn_update_for_commit(root_path) {
                    Ok(update_output) => {
                        let result = run_command_args("svn", &commit_args);
                        match result {
                            Ok(commit_output) => {
                                let combined = format!("[自动更新]\n{update_output}\n\n[提交]\n{commit_output}");
                                success_operation("commit", "svn", "SVN 更新后提交完成", combined)
                            }
                            Err(commit_error) => failed_operation(
                                "commit",
                                "svn",
                                svn_failure_warning("提交", &commit_error),
                                false,
                            ),
                        }
                    }
                    Err(update_error) => failed_operation(
                        "commit",
                        "svn",
                        svn_failure_warning("提交", &update_error),
                        false,
                    ),
                }
            } else {
                failed_operation("commit", "svn", svn_failure_warning("提交", &error), false)
            }
        }
    }
}

/// Recreate .svn working copy metadata when missing or broken.
/// Returns Ok(true) if recreated, Ok(false) if already healthy, Err on failure.
pub fn recreate_svn_workdir(path: &str, remote_url: &str) -> Result<bool, String> {
    let svn_dir = std::path::Path::new(path).join(".svn");
    if svn_dir.exists() {
        // Always run cleanup first — it's idempotent and the only reliable way to clear locks
        // (svn info can succeed even on a locked working copy)
        if run_command_args("svn", &["cleanup".into(), path.to_string()]).is_ok() {
            return Ok(false); // cleanup succeeded, working copy is healthy
        }
        // Cleanup failed — remove broken .svn
        try_cleanup_svn_workdir(path);
    }
    // Checkout --depth empty to create .svn metadata only (fast, no file download)
    crate::command_exec::run_command_args(
        "svn",
        &["checkout".into(), "--depth".into(), "empty".into(), remote_url.to_string(), path.to_string()],
    )?;
    // Change ambient depth to infinity so subsequent update pulls all files
    crate::command_exec::run_command_args(
        "svn",
        &["update".into(), "--accept".into(), "postpone".into(), "--non-interactive".into(), "--set-depth".into(), "infinity".into(), path.to_string()],
    )?;
    Ok(true)
}

pub fn svn_update_result(path: &str, depth: Option<&str>) -> OperationResult {
    // Restore missing items first — `svn update` won't restore manually deleted directories
    let restore_output = svn_restore_missing(path);

    let mut args = vec!["update".to_string(), "--accept".into(), "postpone".into(), "--non-interactive".into()];
    match depth {
        Some(d) if d != "infinity" => {
            args.push("--depth".to_string());
            args.push(d.to_string());
        }
        _ => {
            args.push("--set-depth".to_string());
            args.push("infinity".to_string());
        }
    }
    args.push(path.to_string());
    match run_command_args("svn", &args) {
        Ok(output) => {
            let summary = parse_svn_update_output(&output);
            let combined = match restore_output {
                Ok(ref r) if !r.is_empty() => format!("[恢复缺失项]\n{r}\n\n[更新]\n{output}"),
                _ => output.clone(),
            };
            let restore_count = restore_output.as_ref().map_or(0, |r| r.lines().count());
            let already_up_to_date = output.contains("At revision");
            let msg = match (summary.total, restore_count, already_up_to_date) {
                (0, 0, true) => "SVN 已是最新".to_string(),
                (0, 0, false) => "SVN 更新完成".to_string(),
                (u, 0, _) => format!("SVN 更新完成（{} 项）", u),
                (0, r, _) => format!("SVN 更新完成（恢复 {} 个缺失项）", r),
                (u, r, _) => format!("SVN 更新完成（恢复 {} 个缺失项，更新 {} 项）", r, u),
            };
            OperationResult {
                operation: "update".to_string(),
                vcs_type: "svn".to_string(),
                success: true,
                summary: msg,
                output: filter_svn_output(&combined),
                warning: None,
                missing_svn_cli: false,
            }
        }
        Err(error) => {
            let missing_svn_cli = is_missing_svn_cli_error(&error);
            let _ = run_command_args("svn", &["cleanup".into(), path.to_string()]);
            try_cleanup_svn_workdir(path);
            OperationResult {
                operation: "update".to_string(),
                vcs_type: "svn".to_string(),
                success: false,
                summary: "SVN 更新失败".to_string(),
                output: String::new(),
                warning: Some(svn_failure_warning("更新", &error)),
                missing_svn_cli,
            }
        }
    }
}

pub fn svn_update_streaming(
    app: &tauri::AppHandle,
    path: &str,
    depth: Option<&str>,
) -> OperationResult {
    // Restore missing items first — `svn update` won't restore manually deleted directories
    let restore_output = svn_restore_missing(path);

    let mut args = vec!["update".to_string(), "--accept".into(), "postpone".into(), "--non-interactive".into()];
    match depth {
        Some(d) if d != "infinity" => {
            args.push("--depth".to_string());
            args.push(d.to_string());
        }
        _ => {
            args.push("--set-depth".to_string());
            args.push("infinity".to_string());
        }
    }
    args.push(path.to_string());

    let resolved = crate::command_exec::resolve_program("svn");
    let mut child = match new_command(&resolved)
        .args(&args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            return OperationResult {
                operation: "update".to_string(),
                vcs_type: "svn".to_string(),
                success: false,
                summary: "SVN 更新启动失败".to_string(),
                output: String::new(),
                warning: Some(e.to_string()),
                missing_svn_cli: false,
            };
        }
    };

    crate::command_exec::set_running_pid(child.id());

    let stdout_handle = child.stdout.take().map(|p| spawn_pipe_reader(app.clone(), p));
    let stderr_handle = child.stderr.take().map(|p| spawn_pipe_reader(app.clone(), p));

    let full_output = stdout_handle.map(|h| h.join().unwrap_or_default()).unwrap_or_default();
    let stderr_output = stderr_handle.map(|h| h.join().unwrap_or_default()).unwrap_or_default();

    let status = child.wait().unwrap_or_default();
    crate::command_exec::clear_running_pid();

    if status.success() {
        let summary = parse_svn_update_output(&full_output);
        let combined = match restore_output {
            Ok(ref r) if !r.is_empty() => format!("[恢复缺失项]\n{r}\n\n[更新]\n{full_output}"),
            _ => full_output.clone(),
        };
        let restore_count = restore_output.as_ref().map_or(0, |r| r.lines().count());
        let already_up_to_date = full_output.contains("At revision");
        let msg = match (summary.total, restore_count, already_up_to_date) {
            (0, 0, true) => "SVN 已是最新".to_string(),
            (0, 0, false) => "SVN 更新完成".to_string(),
            (u, 0, _) => format!("SVN 更新完成（{} 项）", u),
            (0, r, _) => format!("SVN 更新完成（恢复 {} 个缺失项）", r),
            (u, r, _) => format!("SVN 更新完成（恢复 {} 个缺失项，更新 {} 项）", r, u),
        };
        OperationResult {
            operation: "update".to_string(),
            vcs_type: "svn".to_string(),
            success: true,
            summary: msg,
            output: filter_svn_output(&combined),
            warning: None,
            missing_svn_cli: false,
        }
    } else {
        let missing_svn_cli = is_missing_svn_cli_error(&stderr_output);
        // If the update was cancelled or failed, try to clean up the locked .svn
        let _ = run_command_args("svn", &["cleanup".into(), path.to_string()]);
        try_cleanup_svn_workdir(path);
        OperationResult {
            operation: "update".to_string(),
            vcs_type: "svn".to_string(),
            success: false,
            summary: "SVN 更新失败".to_string(),
            output: filter_svn_output(&full_output),
            warning: Some(svn_failure_warning("更新", &stderr_output)),
            missing_svn_cli,
        }
    }
}

pub fn svn_absolute_path(root_path: &str, relative_path: &str) -> Result<String, String> {
    let relative = normalize_relative_path(relative_path)?;
    let joined = Path::new(root_path).join(relative.replace('/', std::path::MAIN_SEPARATOR_STR));
    Ok(os_str_to_string(joined.as_os_str()))
}

pub fn is_missing_svn_cli_error(error: &str) -> bool {
    let normalized = error.to_lowercase();
    normalized.contains("the system cannot find the file specified")
        || normalized.contains("program not found")
        || normalized.contains("找不到")
        || normalized.contains("os error 2")
        || normalized.contains("no such file or directory")
}

pub fn svn_status_warning(error: &str) -> String {
    svn_failure_warning("状态检测", error)
}

pub fn is_svn_locked_error(error: &str) -> bool {
    let lower = error.to_lowercase();
    lower.contains("locked")
        || lower.contains("e155004")
        || lower.contains("e200033")
        || lower.contains("e155037")
        || lower.contains("previous operation has not finished")
        || lower.contains("run 'cleanup'")
        || lower.contains("run 'svn cleanup'")
}

/// 根据操作名称生成 SVN 失败警告，统一处理 svn.exe 缺失、工作副本锁定等常见错误
pub fn svn_failure_warning(operation: &str, error: &str) -> String {
    if is_missing_svn_cli_error(error) {
        "当前环境没有可调用的 svn.exe。TortoiseSVN GUI 可用于识别工作副本，但命令行功能需要 SVN 命令行工具。可以安装 SlikSVN，或重新安装 / 修改 TortoiseSVN 并勾选 command line client tools。".to_string()
    } else if is_svn_locked_error(error) {
        format!("SVN 工作副本已被锁定，上一次操作可能未完成或被中断。\n请点击工具栏中的 Cleanup 按钮解除锁定后重试。\n\n原始错误：{error}")
    } else if is_svn_tree_conflict_error(error) {
        format!("SVN {operation}遇到树冲突（可能是空目录或不完整检出导致）。\n请尝试：\n1. 使用工具栏 Cleanup 解除锁定\n2. 使用工具栏 强制更新 恢复目录\n3. 或右键该目录 → SVN Revert\n\n原始错误：{error}")
    } else if error.trim().is_empty() {
        format!("SVN {operation}失败，命令无错误输出，请检查网络连接、认证信息或工作副本状态")
    } else {
        format!("SVN {operation}失败：{error}")
    }
}

pub fn svn_has_remote_updates(path: &str) -> Result<bool, String> {
    // Compare local working copy revision against latest server revision.
    // This is more reliable than `svn status -u` which checks per-file.
    let local_rev = svn_info(path)
        .ok()
        .and_then(|info| parse_svn_info_item(&info, "Revision"))
        .and_then(|r| r.parse::<i64>().ok());
    let head_output = run_command(["svn", "info", "-r", "HEAD", path])?;
    let head_rev = parse_svn_info_item(&head_output, "Revision")
        .and_then(|r| r.parse::<i64>().ok());
    match (local_rev, head_rev) {
        (Some(local), Some(head)) => Ok(head > local),
        (None, _) => Err("无法获取本地 SVN 版本号".to_string()),
        (_, None) => Err("无法解析服务器 HEAD 版本号".to_string()),
    }
}

fn normalized_commit_paths(files: &[CommitFileRequest]) -> Result<Vec<String>, String> {
    files
        .iter()
        .map(|file| normalize_relative_path(&file.path))
        .collect::<Result<Vec<_>, _>>()
}

// ── SVN Remote File Browsing ──────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SvnRemoteEntry {
    pub name: String,
    pub entry_type: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SvnRemoteDirectory {
    pub entries: Vec<SvnRemoteEntry>,
    pub path: String,
    pub parent_path: Option<String>,
}

pub fn svn_remote_list(url: &str) -> Result<SvnRemoteDirectory, String> {
    // Use --xml for reliable parsing (svn list output has variable-width columns)
    let output = run_command(["svn", "list", "--xml", url])?;

    let mut entries: Vec<SvnRemoteEntry> = parse_svn_list_xml(&output);
    sort_svn_remote_entries(&mut entries);

    let path = url.to_string();
    // Build parent path by removing the last path segment
    let trimmed_url = url.trim_end_matches('/');
    let parent_path = if let Some(idx) = trimmed_url.rfind('/') {
        let parent = trimmed_url[..idx].to_string();
        // Only show parent if it's not just the scheme+host
        if parent.len() > 10 {
            Some(parent)
        } else {
            None
        }
    } else {
        None
    };

    Ok(SvnRemoteDirectory {
        entries,
        path,
        parent_path,
    })
}

fn parse_svn_list_xml(xml: &str) -> Vec<SvnRemoteEntry> {
    let mut entries = Vec::new();
    let bytes = xml.as_bytes();
    let len = bytes.len();
    let mut pos = 0;

    while pos < len {
        // Look for <entry
        if pos + 6 < len && &bytes[pos..pos+6] == b"<entry" {
            // Find kind attribute in the entry tag
            let entry_slice = &xml[pos..];
            let mut entry_kind = "file";
            if let Some(ks) = entry_slice.find("kind=\"") {
                let after = &entry_slice[ks+6..];
                if let Some(end) = after.find('"') {
                    entry_kind = &after[..end];
                }
            }

            // Find <name> tag, search from pos
            let name_slice = &xml[pos..];
            if let Some(name_start) = name_slice.find("<name>") {
                let after_name = &name_slice[name_start+6..];
                if let Some(name_end) = after_name.find("</name>") {
                    let name = &after_name[..name_end];
                    let name_clean = name.trim_end_matches('/');
                    if !name_clean.is_empty() {
                        entries.push(SvnRemoteEntry {
                            name: name_clean.to_string(),
                            entry_type: if entry_kind == "dir" { "directory" } else { "file" }.to_string(),
                        });
                    }
                }
            }

            // Skip past </entry>
            if let Some(entry_end) = xml[pos..].find("</entry>") {
                pos += entry_end + 8;
            } else {
                break;
            }
        } else {
            pos += 1;
        }
    }

    entries
}

fn sort_svn_remote_entries(entries: &mut [SvnRemoteEntry]) {
    entries.sort_by(|left, right| {
        let left_is_dir = left.entry_type == "directory";
        let right_is_dir = right.entry_type == "directory";
        right_is_dir
            .cmp(&left_is_dir)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
}

pub fn svn_remote_cat(url: &str) -> Result<String, String> {
    run_command(["svn", "cat", url])
}

// ── SVN wc.db helpers ─────────────────────────────────────────────────────

fn detect_svn_metadata_from_wc_db(path: &Path) -> Result<SvnMetadata, String> {
    let wc_db_path =
        find_svn_wc_db(path).ok_or_else(|| "未找到 SVN 工作副本数据库".to_string())?;
    let connection = Connection::open(wc_db_path).map_err(|error| error.to_string())?;

    let remote_url = svn_wc_remote_url(&connection)?;
    let revision = svn_wc_revision(&connection)?;

    Ok(SvnMetadata {
        remote_url,
        revision,
    })
}

fn find_svn_wc_db(path: &Path) -> Option<PathBuf> {
    let mut cursor = if path.is_file() {
        path.parent()?.to_path_buf()
    } else {
        path.to_path_buf()
    };

    loop {
        let wc_db_path = cursor.join(".svn").join("wc.db");
        if wc_db_path.exists() {
            return Some(wc_db_path);
        }

        if !cursor.pop() {
            return None;
        }
    }
}

fn svn_wc_remote_url(connection: &Connection) -> Result<Option<String>, String> {
    connection
        .query_row(
            "SELECT repository.root, nodes.repos_path
             FROM nodes
             JOIN repository ON nodes.repos_id = repository.id
             WHERE nodes.local_relpath = ''
             ORDER BY nodes.op_depth DESC
             LIMIT 1",
            [],
            |row| {
                let root: String = row.get(0)?;
                let repos_path: Option<String> = row.get(1)?;
                Ok(join_svn_url(&root, repos_path.as_deref().unwrap_or("")))
            },
        )
        .optional()
        .map_err(|error| error.to_string())
}

fn svn_wc_revision(connection: &Connection) -> Result<Option<String>, String> {
    connection
        .query_row(
            "SELECT MAX(revision)
             FROM nodes
             WHERE revision IS NOT NULL AND revision >= 0",
            [],
            |row| row.get::<_, Option<i64>>(0),
        )
        .optional()
        .map(|value| value.flatten().map(|revision| revision.to_string()))
        .map_err(|error| error.to_string())
}

fn join_svn_url(root: &str, repos_path: &str) -> String {
    if repos_path.is_empty() {
        root.to_string()
    } else {
        format!(
            "{}/{}",
            root.trim_end_matches('/'),
            repos_path.trim_start_matches('/')
        )
    }
}

pub fn repository_relative_change_path(path: &str, root_path: &str) -> String {
    let normalized_path =
        crate::db::strip_windows_extended_path_prefix(path).replace('\\', "/");
    let normalized_root =
        crate::db::strip_windows_extended_path_prefix(root_path).replace('\\', "/");
    let root = normalized_root.trim_end_matches('/');

    if let Some(rest) = normalized_path.strip_prefix(root) {
        return rest.trim_start_matches('/').to_string();
    }

    let lower_path = normalized_path.to_lowercase();
    let lower_root = root.to_lowercase();
    if lower_path.starts_with(&lower_root) {
        return normalized_path[root.len()..]
            .trim_start_matches('/')
            .to_string();
    }

    if let (Ok(root), Ok(candidate)) = (
        std::path::Path::new(root_path).canonicalize(),
        std::path::Path::new(path).canonicalize(),
    ) {
        if let Ok(relative) = candidate.strip_prefix(root) {
            return os_str_to_string(relative.as_os_str()).replace('\\', "/");
        }
    }

    normalized_path
}

pub fn parse_svn_ignore_recursive(output: &str) -> Vec<crate::models::SvnIgnoreEntry> {
    let mut entries = Vec::new();
    let mut current_dir: Option<String> = None;
    let mut current_rules: Vec<String> = Vec::new();

    for line in output.lines() {
        if line.trim().is_empty() {
            if let Some(dir) = current_dir.take() {
                entries.push(crate::models::SvnIgnoreEntry {
                    directory: dir,
                    rules: std::mem::take(&mut current_rules),
                });
            }
            continue;
        }

        if let Some((dir, first_rule)) = line.split_once(" - ") {
            if let Some(prev_dir) = current_dir.take() {
                entries.push(crate::models::SvnIgnoreEntry {
                    directory: prev_dir,
                    rules: std::mem::take(&mut current_rules),
                });
            }
            current_dir = Some(dir.to_string());
            if !first_rule.is_empty() {
                current_rules.push(first_rule.to_string());
            }
        } else if current_dir.is_some() {
            current_rules.push(line.to_string());
        }
    }

    if let Some(dir) = current_dir {
        if !current_rules.is_empty() {
            entries.push(crate::models::SvnIgnoreEntry {
                directory: dir,
                rules: current_rules,
            });
        }
    }

    entries
}

// ── SVN Revert ───────────────────────────────────────────────────────────────

pub fn svn_revert(root_path: &str, relative_path: &str) -> OperationResult {
    let path = match svn_absolute_path(root_path, relative_path) {
        Ok(p) => p,
        Err(e) => return failed_operation("revert", "svn", e, false),
    };
    match run_command_args("svn", &["revert".into(), path]) {
        Ok(output) => success_operation("revert", "svn", "SVN revert 完成", output),
        Err(error) => failed_operation("revert", "svn", svn_failure_warning("revert", &error), false),
    }
}

// ── SVN Cleanup ───────────────────────────────────────────────────────────────

pub fn svn_cleanup(root_path: &str) -> OperationResult {
    match run_command(["svn", "cleanup", root_path]) {
        Ok(output) => success_operation("cleanup", "svn", "SVN cleanup 完成", output),
        Err(error) => failed_operation("cleanup", "svn", format!("SVN cleanup 失败：{error}"), false),
    }
}

/// Streaming cleanup with progress output (cancellable).
pub fn svn_cleanup_streaming(app: &tauri::AppHandle, path: &str) -> OperationResult {
    let resolved = crate::command_exec::resolve_program("svn");
    let mut child = match crate::command_exec::new_command(&resolved)
        .args(&["cleanup".to_string(), path.to_string()])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            return failed_operation("cleanup", "svn", e.to_string(), false);
        }
    };

    crate::command_exec::set_running_pid(child.id());

    let stdout_handle = child.stdout.take().map(|p| spawn_pipe_reader(app.clone(), p));
    let stderr_handle = child.stderr.take().map(|p| spawn_pipe_reader(app.clone(), p));

    let output = stdout_handle.map(|h| h.join().unwrap_or_default()).unwrap_or_default();
    let _stderr_output = stderr_handle.map(|h| h.join().unwrap_or_default()).unwrap_or_default();

    let status = child.wait().unwrap_or_default();
    crate::command_exec::clear_running_pid();

    // Drain stderr
    if let Some(mut stderr) = child.stderr.take() {
        let _ = stderr.read_to_string(&mut String::new());
    }

    if status.success() {
        success_operation("cleanup", "svn", "SVN cleanup 完成", output)
    } else {
        try_cleanup_svn_workdir(path);
        success_operation("cleanup", "svn", "SVN cleanup 无法修复工作副本，已删除损坏的 .svn 元数据，请点击更新重新拉取", output)
    }
}

// ── SVN Resolve (mark as resolved) ────────────────────────────────────────────

pub fn svn_resolve(root_path: &str, relative_path: &str) -> OperationResult {
    svn_resolve_accept(root_path, relative_path, "working")
}

/// SVN conflict resolution with configurable accept type:
/// - "base"     → discard both local and server changes, revert to base
/// - "working"  → keep current working copy (default resolve)
/// - "mine-full" → keep local version, discard server changes
/// - "theirs-full" → accept server version, discard local changes
pub fn svn_resolve_accept(root_path: &str, relative_path: &str, accept: &str) -> OperationResult {
    let path = match svn_absolute_path(root_path, relative_path) {
        Ok(p) => p,
        Err(e) => return failed_operation("resolve", "svn", e, false),
    };
    let label = match accept {
        "base" => "接受原始版本",
        "mine-full" => "接受本地版本",
        "theirs-full" => "接受服务器版本",
        _ => "标记已解决",
    };
    match run_command_args("svn", &["resolve".into(), "--accept".into(), accept.into(), path]) {
        Ok(output) => {
            let summary = format!("SVN resolve ({label}) 完成");
            success_operation("resolve", "svn", &summary, output)
        }
        Err(error) => failed_operation("resolve", "svn", svn_failure_warning("resolve", &error), false),
    }
}

// ── Missing item detection and restore ─────────────────────────────────────

/// Detect missing items from `svn status` output (lines starting with `!`).
fn svn_missing_paths(root_path: &str) -> Vec<String> {
    let output = match run_command(["svn", "status", root_path]) {
        Ok(o) => o,
        Err(_) => return Vec::new(),
    };
    output
        .lines()
        .filter_map(|line| {
            if line.starts_with('!') {
                let path = status_path_after_svn_status(line).trim().to_string();
                if path.is_empty() { None } else { Some(path) }
            } else {
                None
            }
        })
        .collect()
}

/// Restore missing items by running `svn revert` on each path.
/// Returns the revert output combined, or an error if any revert fails.
fn svn_restore_missing(root_path: &str) -> Result<String, String> {
    let missing = svn_missing_paths(root_path);
    if missing.is_empty() {
        return Ok(String::new());
    }
    let mut combined = String::new();
    for rel_path in &missing {
        let abs_path = svn_absolute_path(root_path, rel_path)?;
        let output = run_command_args("svn", &["revert".into(), abs_path])?;
        if !combined.is_empty() {
            combined.push('\n');
        }
        combined.push_str(&output);
    }
    Ok(combined)
}

/// Remove SVN summary/meta lines from update output, keeping only file-level changes.
/// File lines start with U/A/D/G/C/E or space; step labels start with ──.
fn filter_svn_output(raw: &str) -> String {
    raw.lines()
        .filter(|line| {
            let trimmed = line.trim_start();
            if trimmed.is_empty() { return true; }
            let first = trimmed.chars().next().unwrap_or(' ');
            matches!(first, 'U' | 'A' | 'D' | 'G' | 'C' | 'E' | ' ')
                || trimmed.starts_with("──")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

// ── Pipe reader helper ─────────────────────────────────────────────────────

/// Spawn a thread that reads lines from a pipe and emits them via Tauri events.
/// Returns the join handle; call `.join()` to collect the full output string.
fn spawn_pipe_reader(
    app: tauri::AppHandle,
    pipe: impl std::io::Read + Send + 'static,
) -> std::thread::JoinHandle<String> {
    std::thread::spawn(move || {
        let mut output = String::new();
        let reader = std::io::BufReader::new(pipe);
        for line in reader.lines() {
            if let Ok(text) = line {
                let _ = app.emit("svn-update-line", &text);
                output.push_str(&text);
                output.push('\n');
            }
        }
        output
    })
}

// ── SVN Force Update (Clean → Revert → Update to latest) ──────────────────

/// Execute a single SVN step for the force-update pipeline, emitting output lines.
fn svn_force_step(
    app: &tauri::AppHandle,
    args: &[String],
    label: &str,
) -> Result<String, String> {
    let _ = app.emit("svn-update-line", &format!("── {label} ──"));
    let resolved = crate::command_exec::resolve_program("svn");
    let mut child = new_command(&resolved)
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    crate::command_exec::set_running_pid(child.id());

    let stdout_handle = child.stdout.take().map(|p| spawn_pipe_reader(app.clone(), p));
    let stderr_handle = child.stderr.take().map(|p| spawn_pipe_reader(app.clone(), p));

    let output = stdout_handle.map(|h| h.join().unwrap_or_default()).unwrap_or_default();
    let stderr_output = stderr_handle.map(|h| h.join().unwrap_or_default()).unwrap_or_default();

    let status = child.wait().unwrap_or_default();
    crate::command_exec::clear_running_pid();

    if status.success() {
        Ok(output)
    } else {
        Err(if stderr_output.trim().is_empty() { output } else { stderr_output })
    }
}

/// Non-streaming force update: cleanup → revert -R → update.
pub fn svn_update_force(root_path: &str, depth: Option<&str>) -> OperationResult {
    let mut combined = String::new();

    // 1. Cleanup — also remove unversioned & ignored items for a truly clean slate
    match run_command_args("svn", &[
        "cleanup".into(), "--remove-unversioned".into(), "--remove-ignored".into(), root_path.to_string(),
    ]) {
        Ok(out) => {
            combined.push_str("[Cleanup]\n");
            combined.push_str(&out);
            combined.push_str("\n\n");
        }
        Err(e) => {
            combined.push_str(&format!("[Cleanup] 失败 (继续执行): {e}\n\n"));
        }
    }

    // 2. Revert -R (recursive)
    match run_command_args("svn", &["revert".into(), "-R".into(), root_path.to_string()]) {
        Ok(out) => {
            combined.push_str("[Revert -R]\n");
            combined.push_str(&out);
            combined.push_str("\n\n");
        }
        Err(e) => {
            return failed_operation("update", "svn", svn_failure_warning("revert", &e), false);
        }
    }

    // 3. Update — use --set-depth to fix ambient depth after recreate
    let mut update_args = vec!["update".to_string(), "--accept".into(), "postpone".into(), "--non-interactive".into()];
    match depth {
        Some(d) if d != "infinity" => {
            update_args.push("--depth".to_string());
            update_args.push(d.to_string());
        }
        _ => {
            update_args.push("--set-depth".to_string());
            update_args.push("infinity".to_string());
        }
    }
    update_args.push(root_path.to_string());
    match run_command_args("svn", &update_args) {
        Ok(out) => {
            combined.push_str("[Update]\n");
            combined.push_str(&out);
            let summary = parse_svn_update_output(&out);
            let already_up_to_date = out.contains("At revision");
            let msg = if summary.total > 0 {
                format!("SVN 强制更新完成（更新 {} 项）", summary.total)
            } else if already_up_to_date {
                "SVN 已是最新".to_string()
            } else {
                "SVN 强制更新完成".to_string()
            };
            success_operation("update", "svn", &msg, combined)
        }
        Err(error) => {
            let missing_svn_cli = is_missing_svn_cli_error(&error);
            let _ = run_command_args("svn", &["cleanup".into(), root_path.to_string()]);
            try_cleanup_svn_workdir(root_path);
            OperationResult {
                operation: "update".to_string(),
                vcs_type: "svn".to_string(),
                success: false,
                summary: "SVN 强制更新失败".to_string(),
                output: filter_svn_output(&combined),
                warning: Some(svn_failure_warning("强制更新", &error)),
                missing_svn_cli,
            }
        }
    }
}

/// Streaming force update: cleanup → revert -R → update, all with real-time output.
pub fn svn_update_force_streaming(
    app: &tauri::AppHandle,
    path: &str,
    depth: Option<&str>,
) -> OperationResult {
    let mut combined = String::new();

    // 1. Cleanup — also remove unversioned & ignored items for a truly clean slate
    match svn_force_step(app, &[
        "cleanup".into(), "--remove-unversioned".into(), "--remove-ignored".into(), path.to_string(),
    ], "Cleanup") {
        Ok(out) => {
            let label = "[Cleanup]\n";
            let _ = app.emit("svn-update-line", label);
            combined.push_str(label);
            combined.push_str(&out);
            combined.push_str("\n");
        }
        Err(e) => {
            let warn = format!("[Cleanup] 失败 (继续执行): {e}\n");
            let _ = app.emit("svn-update-line", &warn);
            combined.push_str(&warn);
            combined.push('\n');
        }
    }

    // 2. Revert -R
    match svn_force_step(app, &["revert".into(), "-R".into(), path.to_string()], "Revert -R") {
        Ok(out) => {
            let label = "[Revert -R]\n";
            let _ = app.emit("svn-update-line", label);
            combined.push_str(label);
            combined.push_str(&out);
            combined.push_str("\n");
        }
        Err(e) => {
            let _ = run_command_args("svn", &["cleanup".into(), path.to_string()]);
            try_cleanup_svn_workdir(path);
            return OperationResult {
                operation: "update".to_string(),
                vcs_type: "svn".to_string(),
                success: false,
                summary: "SVN 强制更新失败".to_string(),
                output: filter_svn_output(&combined),
                warning: Some(svn_failure_warning("revert", &e)),
                missing_svn_cli: false,
            };
        }
    }

    // 3. Update — use --set-depth to fix ambient depth after recreate
    let mut update_args = vec!["update".to_string(), "--accept".into(), "postpone".into(), "--non-interactive".into()];
    match depth {
        Some(d) if d != "infinity" => {
            update_args.push("--depth".to_string());
            update_args.push(d.to_string());
        }
        _ => {
            update_args.push("--set-depth".to_string());
            update_args.push("infinity".to_string());
        }
    }
    update_args.push(path.to_string());
    match svn_force_step(app, &update_args, "Update") {
        Ok(out) => {
            let label = "[Update]\n";
            let _ = app.emit("svn-update-line", label);
            combined.push_str(label);
            combined.push_str(&out);
            let summary = parse_svn_update_output(&out);
            let already_up_to_date = out.contains("At revision");
            let msg = if summary.total > 0 {
                format!("SVN 强制更新完成（更新 {} 项）", summary.total)
            } else if already_up_to_date {
                "SVN 已是最新".to_string()
            } else {
                "SVN 强制更新完成".to_string()
            };
            OperationResult {
                operation: "update".to_string(),
                vcs_type: "svn".to_string(),
                success: true,
                summary: msg,
                output: filter_svn_output(&combined),
                warning: None,
                missing_svn_cli: false,
            }
        }
        Err(e) => {
            let missing_svn_cli = is_missing_svn_cli_error(&e);
            let _ = run_command_args("svn", &["cleanup".into(), path.to_string()]);
            try_cleanup_svn_workdir(path);
            OperationResult {
                operation: "update".to_string(),
                vcs_type: "svn".to_string(),
                success: false,
                summary: "SVN 强制更新失败".to_string(),
                output: filter_svn_output(&combined),
                warning: Some(svn_failure_warning("强制更新", &e)),
                missing_svn_cli,
            }
        }
    }
}

/// Check if the error indicates a file is out of date (someone else committed a newer version).
pub fn is_svn_out_of_date_error(error: &str) -> bool {
    let lower = error.to_lowercase();
    lower.contains("out of date") || lower.contains("e155011")
}

/// Run `svn update` to bring the working copy up to date before retrying commit.
fn svn_update_for_commit(root_path: &str) -> Result<String, String> {
    run_command(["svn", "update", root_path])
}

/// Check if the error is a tree conflict or empty directory issue
pub fn is_svn_tree_conflict_error(error: &str) -> bool {
    let lower = error.to_lowercase();
    lower.contains("tree conflict")
        || lower.contains("e155015")
        || lower.contains("e155017")
        || lower.contains("e155023")
        || lower.contains("e155024")
        || lower.contains("is not a working copy")
        || lower.contains("e155036")
}

// ── SVN Log ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SvnCommitLog {
    pub revision: i64,
    pub author: String,
    pub date: String,
    pub message: String,
}

pub fn svn_log(root_path: &str, max_count: usize) -> Result<Vec<SvnCommitLog>, String> {
    let output = run_command_args(
        "svn",
        &[
            "log".into(),
            root_path.to_string(),
            "-l".into(),
            max_count.to_string(),
            "-r".into(),
            "HEAD:1".into(),
            "--xml".into(),
        ],
    )?;

    Ok(parse_svn_log_xml(&output))
}

pub fn svn_show_detail(root_path: &str, revision: i64) -> Result<crate::git::CommitDetail, String> {
    // Get metadata via svn log -r <rev> in XML format
    let log_output = run_command_args("svn", &[
        "log".into(), root_path.to_string(),
        "-r".into(), revision.to_string(),
        "--xml".into(),
    ])?;
    let author = extract_xml_tag(&log_output, "author").unwrap_or_default();
    let date = extract_xml_tag(&log_output, "date").unwrap_or_default();
    let message = extract_xml_tag(&log_output, "msg").unwrap_or_default();

    // Get changed files via svn log -v
    let verbose_output = run_command_args("svn", &[
        "log".into(), root_path.to_string(),
        "-v".into(), "-r".into(), revision.to_string(),
        "--xml".into(),
    ])?;
    let files = parse_svn_log_verbose_paths(&verbose_output);

    // Get full diff
    let diff = run_command_args("svn", &[
        "diff".into(), "-c".into(), revision.to_string(), root_path.to_string(),
    ]).unwrap_or_default();

    Ok(crate::git::CommitDetail {
        hash: format!("r{revision}"),
        author,
        date,
        message,
        files,
        diff,
    })
}

fn parse_svn_log_verbose_paths(xml: &str) -> Vec<crate::git::CommitFileChange> {
    let mut files = Vec::new();
    let mut pos = 0;
    let len = xml.len();
    while pos < len {
        if pos + 5 < len && &xml.as_bytes()[pos..pos+5] == b"<path" {
            let slice = &xml[pos..];
            let path_end = slice.find('>').unwrap_or(0);
            let tag = &slice[..path_end];
            // Look for action= attribute
            let action = if let Some(as_) = tag.find("action=\"") {
                let after = &tag[as_ + 8..];
                if let Some(end) = after.find('"') {
                    match &after[..end] {
                        "A" => "added",
                        "M" => "modified",
                        "D" => "deleted",
                        "R" => "renamed",
                        _ => "modified",
                    }
                } else { "modified" }
            } else { "modified" };
            let text_start = path_end + 1;
            let remaining = &slice[text_start..];
            if let Some(text_end) = remaining.find("</path>") {
                let path = remaining[..text_end].to_string();
                if !path.is_empty() {
                    files.push(crate::git::CommitFileChange {
                        path,
                        change_type: action.to_string(),
                    });
                }
                pos += text_start + text_end + 7;
            } else {
                pos += 1;
            }
        } else {
            pos += 1;
        }
    }
    files
}

fn parse_svn_log_xml(xml: &str) -> Vec<SvnCommitLog> {
    let mut logs = Vec::new();
    let mut pos = 0;
    let len = xml.len();

    while pos < len {
        let slice = &xml[pos..];
        let entry_start = slice.find("<logentry");
        match entry_start {
            Some(s) => {
                pos += s;
                let entry_slice = &xml[pos..];

                let revision = if let Some(rs) = entry_slice.find("revision=\"") {
                    let after = &entry_slice[rs + 10..];
                    if let Some(end) = after.find('"') {
                        after[..end].parse::<i64>().ok().unwrap_or(0)
                    } else {
                        0
                    }
                } else {
                    0
                };

                let logentry_end = entry_slice.find("</logentry>").unwrap_or(entry_slice.len());
                let content = &entry_slice[..logentry_end];

                let author = extract_xml_tag(content, "author").unwrap_or_default();
                let date = extract_xml_tag(content, "date").unwrap_or_default();
                let msg = extract_xml_tag(content, "msg").unwrap_or_default();

                logs.push(SvnCommitLog {
                    revision,
                    author,
                    date,
                    message: msg,
                });

                pos += logentry_end + 11;
            }
            None => break,
        }
    }

    logs
}

fn extract_xml_tag(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = xml.find(&open)?;
    let after = &xml[start + open.len()..];
    let end = after.find(&close)?;
    let value = after[..end].trim();
    if value.is_empty() { None } else { Some(value.to_string()) }
}

// ── SVN Update 输出解析 ────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SvnUpdateSummary {
    pub items: Vec<SvnUpdateItem>,
    pub total: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SvnUpdateItem {
    pub action: String,
    pub path: String,
}

pub fn parse_svn_update_output(output: &str) -> SvnUpdateSummary {
    let items: Vec<SvnUpdateItem> = output
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.len() < 3 {
                return None;
            }
            let action = line.chars().next()?;
            match action {
                'A' | 'D' | 'U' | 'G' | 'C' | 'E' => {
                    let rest = &line[1..];
                    if !rest.starts_with(|c: char| c == ' ' || c == '\t') {
                        return None;
                    }
                    let path = rest.trim().to_string();
                    if path.is_empty() {
                        None
                    } else {
                        Some(SvnUpdateItem {
                            action: action.to_string(),
                            path,
                        })
                    }
                }
                _ => None,
            }
        })
        .collect();

    SvnUpdateSummary {
        total: items.len(),
        items,
    }
}

// ── SVN Checkout Helpers ────────────────────────────────────────────────────

fn run_single_update(app: &tauri::AppHandle, path: &str) -> (bool, String) {
    use std::sync::atomic::{AtomicBool, Ordering};
    let resolved = crate::command_exec::resolve_program("svn");
    let args: Vec<String> = vec![
        "update".into(), "--accept".into(), "postpone".into(), "--non-interactive".into(),
        "--set-depth".into(), "infinity".into(), path.to_string(),
    ];
    let mut child = match crate::command_exec::new_command(&resolved)
        .args(&args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => return (false, e.to_string()),
    };

    crate::command_exec::set_running_pid(child.id());

    // Read stdout in a separate thread
    let app_clone = app.clone();
    let stdout = child.stdout.take();
    let reader = std::thread::spawn(move || {
        let mut output = String::new();
        if let Some(out) = stdout {
            let buf = std::io::BufReader::new(out);
            for line in buf.lines() {
                if let Ok(text) = line {
                    let _ = app_clone.emit("clone-progress-line", &text);
                    output.push_str(&text);
                    output.push('\n');
                }
            }
        }
        output
    });

    // Poll directory size every second
    let path_owned = path.to_string();
    let app_poll = app.clone();
    let running = std::sync::Arc::new(AtomicBool::new(true));
    let running_clone = running.clone();
    let poller = std::thread::spawn(move || {
        let mut last_size: u64 = 0;
        while running_clone.load(Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_secs(1));
            let size_bytes = dir_size(&path_owned);
            let size_mb = size_bytes as f64 / (1024.0 * 1024.0);
            let speed_kbps = if size_bytes > last_size { (size_bytes - last_size) as f64 / 1024.0 } else { 0.0 };
            last_size = size_bytes;
            let stats = CloneProgressStats { files: 0, size_mb: Some(size_mb), speed_kbps: if speed_kbps > 0.0 { Some(speed_kbps) } else { None } };
            let _ = app_poll.emit("clone-progress-stats", &stats);
        }
    });

    let status = child.wait().unwrap_or_default();
    crate::command_exec::clear_running_pid();
    running.store(false, Ordering::Relaxed);
    let _ = poller.join();

    let full_output = reader.join().unwrap_or_default();
    let mut stderr_output = String::new();
    if let Some(mut stderr) = child.stderr.take() { let _ = stderr.read_to_string(&mut stderr_output); }
    let combined = if stderr_output.trim().is_empty() { full_output.clone() } else { format!("{full_output}\n{stderr_output}") };

    let final_stats = CloneProgressStats { files: 0, size_mb: Some(dir_size(path) as f64 / (1024.0 * 1024.0)), speed_kbps: None };
    let _ = app.emit("clone-progress-stats", &final_stats);

    (status.success(), combined)
}

fn build_checkout_result(success: bool, full_output: &str, path: &str) -> OperationResult {
    if success {
        let summary = parse_svn_update_output(full_output);
        let msg = if summary.total > 0 { format!("SVN checkout 完成（{} 项）", summary.total) } else { "SVN checkout 完成".to_string() };
        OperationResult { operation: "checkout".into(), vcs_type: "svn".into(), success: true, summary: msg, output: filter_svn_output(full_output), warning: None, missing_svn_cli: false }
    } else {
        try_cleanup_svn_workdir(path);
        OperationResult { operation: "checkout".into(), vcs_type: "svn".into(), success: false, summary: "SVN checkout 失败".to_string(), output: filter_svn_output(full_output), warning: Some("检出失败".to_string()), missing_svn_cli: false }
    }
}

// ── SVN Checkout (streaming) ──────────────────────────────────────────────

/// Recursively count total file sizes in a directory (excludes .svn metadata).
fn dir_size(path: &str) -> u64 {
    let mut total: u64 = 0;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.file_name().map_or(false, |n| n == ".svn") {
                continue;
            }
            if p.is_dir() {
                total += dir_size(&p.to_string_lossy());
            } else if let Ok(meta) = p.metadata() {
                total += meta.len();
            }
        }
    }
    total
}

pub fn svn_checkout_streaming(
    app: &tauri::AppHandle,
    url: &str,
    path: &str,
    ignore_externals: bool,
) -> OperationResult {
    // Step 1: checkout --depth empty (instant — creates .svn metadata only)
    // Skip if .svn already exists (e.g., pre-created by clone_repository for early DB insert)
    let svn_dir = std::path::Path::new(path).join(".svn");
    if !svn_dir.exists() {
    let _ = app.emit("clone-progress-line", "── Step 1: 创建 .svn 元数据 ──");
    let mut co_args: Vec<String> = vec!["checkout".into(), "--depth".into(), "empty".into()];
    if ignore_externals {
        co_args.push("--ignore-externals".into());
    }
    co_args.push(url.to_string());
    co_args.push(path.to_string());

    match crate::command_exec::run_command_args("svn", &co_args) {
        Ok(_) => {
            // .svn metadata created — notify frontend so repo appears in list immediately
            let _ = app.emit("clone-repo-ready", path.to_string());
        }
        Err(error) => {
            let missing_svn_cli = is_missing_svn_cli_error(&error);
            return OperationResult {
                operation: "checkout".to_string(),
                vcs_type: "svn".to_string(),
                success: false,
                summary: "SVN checkout 初始化失败".to_string(),
                output: String::new(),
                warning: Some(svn_failure_warning("checkout", &error)),
                missing_svn_cli,
            };
        }
    };
    } // end if !svn_dir.exists()

    // Step 2: single-threaded svn update with real-time size polling
    let _ = app.emit("clone-progress-line", "── Step 2: 拉取仓库文件 ──");
    let (success, output) = run_single_update(app, path);
    return build_checkout_result(success, &output, path);
}

pub fn try_cleanup_svn_workdir(path: &str) {
    let svn_dir = std::path::Path::new(path).join(".svn");
    if !svn_dir.exists() { return; }
    // Try svn cleanup first — if it succeeds, the workdir is healthy
    if crate::command_exec::run_command_args("svn", &["cleanup".into(), path.to_string()]).is_ok() {
        return;
    }
    // cleanup failed — remove stale SQLite WAL/SHM + the broken .svn directory
    let _ = std::fs::remove_file(svn_dir.join("wc.db-wal"));
    let _ = std::fs::remove_file(svn_dir.join("wc.db-shm"));
    let _ = std::fs::remove_dir_all(&svn_dir);
}
