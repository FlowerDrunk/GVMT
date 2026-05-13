use crate::command_exec::{new_command, os_str_to_string, run_command, run_command_args};
use tauri::Emitter;
use crate::file_browser::normalize_relative_path;
use crate::models::{ChangeItem, CommitFileRequest, OperationResult, SvnMetadata};
use crate::utils::{failed_operation, slice_from_char, success_operation};
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

pub fn svn_status_changes(path: &str) -> Result<Vec<ChangeItem>, String> {
    let output = run_command(["svn", "status", path])?;
    let patterns = load_svnignore_patterns(path);
    Ok(output
        .lines()
        .filter_map(|line| parse_svn_status_line(line, path))
        .filter(|change| {
            // 过滤 .svnignore 文件本身
            if change.path == ".svnignore" {
                return false;
            }
            // 过滤匹配 .svnignore 规则的文件
            !is_ignored_by_svnignore(&change.path, &patterns)
        })
        .collect::<Vec<_>>())
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

    let path = status_path_after_svn_status(line);
    if path.is_empty() {
        return None;
    }

    Some(ChangeItem {
        path: repository_relative_change_path(path, root_path),
        status: svn_status_kind(status_code).to_string(),
        vcs_type: "svn".to_string(),
        staged: false,
    })
}

pub fn status_path_after_svn_status(line: &str) -> &str {
    let after_status = slice_from_char(line, 1).unwrap_or("").trim_start();
    if let Some(after_columns) = slice_from_char(line, 8) {
        let fixed_width = after_columns.trim_start();
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

pub fn svn_status_kind(status_code: char) -> &'static str {
    match status_code {
        'A' => "added",
        'M' => "modified",
        'D' => "deleted",
        'R' => "renamed",
        '?' => "untracked",
        'C' | '!' | '~' => "conflicted",
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
                        format!("SVN add 失败：{error}"),
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
        Err(error) => failed_operation("commit", "svn", format!("SVN 提交失败：{error}"), false),
    }
}

pub fn svn_update_result(path: &str, depth: Option<&str>) -> OperationResult {
    let mut args = vec!["update".to_string(), path.to_string()];
    if let Some(d) = depth {
        if d != "infinity" {
            args.push("--depth".to_string());
            args.push(d.to_string());
        }
    }
    match run_command_args("svn", &args) {
        Ok(output) => OperationResult {
            operation: "update".to_string(),
            vcs_type: "svn".to_string(),
            success: true,
            summary: "SVN 更新完成".to_string(),
            output,
            warning: None,
            missing_svn_cli: false,
        },
        Err(error) => {
            let missing_svn_cli = is_missing_svn_cli_error(&error);
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
    let mut args = vec!["update".to_string(), path.to_string()];
    if let Some(d) = depth {
        if d != "infinity" {
            args.push("--depth".to_string());
            args.push(d.to_string());
        }
    }

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

    let mut full_output = String::new();
    if let Some(stdout) = child.stdout.take() {
        let reader = std::io::BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(text) = line {
                let _ = app.emit("svn-update-line", &text);
                full_output.push_str(&text);
                full_output.push('\n');
            }
        }
    }

    let status = child.wait().unwrap_or_default();
    let mut stderr_output = String::new();
    if let Some(mut stderr) = child.stderr.take() {
        let _ = stderr.read_to_string(&mut stderr_output);
    }

    if status.success() {
        OperationResult {
            operation: "update".to_string(),
            vcs_type: "svn".to_string(),
            success: true,
            summary: "SVN 更新完成".to_string(),
            output: full_output,
            warning: None,
            missing_svn_cli: false,
        }
    } else {
        let missing_svn_cli = is_missing_svn_cli_error(&stderr_output);
        OperationResult {
            operation: "update".to_string(),
            vcs_type: "svn".to_string(),
            success: false,
            summary: "SVN 更新失败".to_string(),
            output: full_output,
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

/// 根据操作名称生成 SVN 失败警告，统一处理 svn.exe 缺失检测
pub fn svn_failure_warning(operation: &str, error: &str) -> String {
    if is_missing_svn_cli_error(error) {
        "当前环境没有可调用的 svn.exe。TortoiseSVN GUI 可用于识别工作副本，但命令行功能需要 SVN 命令行工具。可以安装 SlikSVN，或重新安装 / 修改 TortoiseSVN 并勾选 command line client tools。".to_string()
    } else if error.trim().is_empty() {
        format!("SVN {operation}失败，命令无错误输出，请检查网络连接、认证信息或工作副本状态")
    } else {
        format!("SVN {operation}失败：{error}")
    }
}

pub fn svn_has_remote_updates(path: &str) -> Result<bool, String> {
    // svn status -u shows remote status (an '*' in column 8 means remote is newer)
    let output = run_command(["svn", "status", "-u", path])?;
    Ok(output.lines().any(|line| {
        // Column 8 (index 7) shows '*' if remote has newer version
        line.chars().nth(7) == Some('*')
    }))
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
        Err(error) => failed_operation("revert", "svn", format!("SVN revert 失败：{error}"), false),
    }
}

// ── SVN Cleanup ───────────────────────────────────────────────────────────────

pub fn svn_cleanup(root_path: &str) -> OperationResult {
    match run_command(["svn", "cleanup", root_path]) {
        Ok(output) => success_operation("cleanup", "svn", "SVN cleanup 完成", output),
        Err(error) => failed_operation("cleanup", "svn", format!("SVN cleanup 失败：{error}"), false),
    }
}

// ── SVN Resolve (mark as resolved) ────────────────────────────────────────────

pub fn svn_resolve(root_path: &str, relative_path: &str) -> OperationResult {
    let path = match svn_absolute_path(root_path, relative_path) {
        Ok(p) => p,
        Err(e) => return failed_operation("resolve", "svn", e, false),
    };
    match run_command_args("svn", &["resolve".into(), "--accept".into(), "working".into(), path]) {
        Ok(output) => success_operation("resolve", "svn", "SVN resolve 完成", output),
        Err(error) => failed_operation("resolve", "svn", format!("SVN resolve 失败：{error}"), false),
    }
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
                    let path = line[1..].trim().to_string();
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
