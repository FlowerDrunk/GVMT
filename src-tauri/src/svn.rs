use crate::command_exec::{os_str_to_string, run_command, run_command_args};
use crate::file_browser::normalize_relative_path;
use crate::models::{ChangeItem, CommitFileRequest, OperationResult, SvnMetadata};
use crate::utils::{failed_operation, slice_from_char, success_operation};
use rusqlite::{Connection, OptionalExtension};
use std::path::{Path, PathBuf};

pub fn svn_info(path: &str) -> Result<String, String> {
    run_command(["svn", "info", path])
}

pub fn detect_svn_metadata(
    path: &str,
    repository_path: &Path,
) -> Result<SvnMetadata, String> {
    svn_info(path)
        .map(|info| SvnMetadata {
            remote_url: parse_svn_info_item(&info, "URL"),
            revision: parse_svn_info_item(&info, "Revision"),
        })
        .or_else(|_| detect_svn_metadata_from_wc_db(repository_path))
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
    Ok(output
        .lines()
        .filter_map(|line| parse_svn_status_line(line, path))
        .collect::<Vec<_>>())
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
    let normalized_paths = match normalized_commit_paths(files) {
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

pub fn svn_update_result(path: &str) -> OperationResult {
    match run_command(["svn", "update", path]) {
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
                warning: Some(svn_status_warning(&error)),
                missing_svn_cli,
            }
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
    if is_missing_svn_cli_error(error) {
        "当前环境没有可调用的 svn.exe。TortoiseSVN GUI 可用于识别工作副本，但状态检测仍需要 SVN 命令行工具。可以安装 SlikSVN，或重新安装 / 修改 TortoiseSVN 并勾选 command line client tools。".to_string()
    } else {
        format!("SVN 状态检测失败：{error}")
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

use serde::Serialize;

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
