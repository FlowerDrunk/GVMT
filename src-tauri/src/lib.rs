use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::UNIX_EPOCH,
};
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Repository {
    id: i64,
    name: String,
    path: String,
    vcs_type: String,
    remote_url: Option<String>,
    branch_or_revision: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DetectedRepository {
    path: String,
    name: String,
    vcs_type: String,
    remote_url: Option<String>,
    branch_or_revision: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AddRepositoryInput {
    path: String,
    name: Option<String>,
}

#[derive(Debug)]
struct SvnMetadata {
    remote_url: Option<String>,
    revision: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChangeItem {
    path: String,
    status: String,
    vcs_type: String,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryStatusSummary {
    total: usize,
    added: usize,
    modified: usize,
    deleted: usize,
    untracked: usize,
    conflicted: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryStatus {
    repository_id: i64,
    vcs_type: String,
    clean: bool,
    warning: Option<String>,
    missing_svn_cli: bool,
    summary: RepositoryStatusSummary,
    changes: Vec<ChangeItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OperationResult {
    operation: String,
    vcs_type: String,
    success: bool,
    summary: String,
    output: String,
    warning: Option<String>,
    missing_svn_cli: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryFileEntry {
    name: String,
    path: String,
    entry_type: String,
    size: Option<u64>,
    modified_at: Option<u64>,
    children: Vec<RepositoryFileEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryDirectory {
    repository_id: i64,
    path: String,
    parent_path: Option<String>,
    entries: Vec<RepositoryFileEntry>,
}

#[tauri::command]
fn list_repositories(app: AppHandle) -> Result<Vec<Repository>, String> {
    let connection = open_database(&app)?;
    let mut statement = connection
        .prepare(
            "SELECT id, name, path, vcs_type, remote_url, branch_or_revision, created_at, updated_at
             FROM repositories
             ORDER BY updated_at DESC, name ASC",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            Ok(Repository {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                vcs_type: row.get(3)?,
                remote_url: row.get(4)?,
                branch_or_revision: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn add_repository(app: AppHandle, input: AddRepositoryInput) -> Result<Repository, String> {
    let detected = detect_repository(input.path)?;
    let name = input.name.unwrap_or(detected.name);
    let connection = open_database(&app)?;

    connection
        .execute(
            "INSERT INTO repositories (name, path, vcs_type, remote_url, branch_or_revision)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(path) DO UPDATE SET
               name = excluded.name,
               vcs_type = excluded.vcs_type,
               remote_url = excluded.remote_url,
               branch_or_revision = excluded.branch_or_revision,
               updated_at = CURRENT_TIMESTAMP",
            params![
                name,
                detected.path,
                detected.vcs_type,
                detected.remote_url,
                detected.branch_or_revision
            ],
        )
        .map_err(|error| error.to_string())?;

    find_repository_by_path(&connection, &detected.path)?
        .ok_or_else(|| "仓库保存后未能读取记录".to_string())
}

#[tauri::command]
fn refresh_repository(app: AppHandle, id: i64) -> Result<Repository, String> {
    let connection = open_database(&app)?;
    let repository = find_repository_by_id(&connection, id)?
        .ok_or_else(|| "未找到需要重新检测的仓库".to_string())?;
    let detected = detect_repository(repository.path)?;

    connection
        .execute(
            "UPDATE repositories
             SET name = ?1,
                 path = ?2,
                 vcs_type = ?3,
                 remote_url = ?4,
                 branch_or_revision = ?5,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?6",
            params![
                detected.name,
                detected.path,
                detected.vcs_type,
                detected.remote_url,
                detected.branch_or_revision,
                id
            ],
        )
        .map_err(|error| error.to_string())?;

    find_repository_by_id(&connection, id)?.ok_or_else(|| "仓库重新检测后未能读取记录".to_string())
}

#[tauri::command]
fn get_repository_status(app: AppHandle, id: i64) -> Result<RepositoryStatus, String> {
    let connection = open_database(&app)?;
    let repository = find_repository_by_id(&connection, id)?
        .ok_or_else(|| "未找到需要检测状态的仓库".to_string())?;

    let mut warning = None;
    let mut missing_svn_cli = false;
    let mut changes = Vec::new();

    match repository.vcs_type.as_str() {
        "git" => changes.extend(git_status_changes(&repository.path)?),
        "svn" => match svn_status_changes(&repository.path) {
            Ok(items) => changes.extend(items),
            Err(error) => {
                missing_svn_cli = is_missing_svn_cli_error(&error);
                warning = Some(svn_status_warning(&error));
            }
        },
        "mixed" => {
            changes.extend(git_status_changes(&repository.path)?);
            match svn_status_changes(&repository.path) {
                Ok(items) => changes.extend(items),
                Err(error) => {
                    missing_svn_cli = is_missing_svn_cli_error(&error);
                    warning = Some(svn_status_warning(&error));
                }
            }
        }
        _ => warning = Some("当前目录未识别为 Git 或 SVN 仓库，请先重新检测。".to_string()),
    }

    let summary = summarize_changes(&changes);
    let clean = summary.total == 0 && warning.is_none();

    Ok(RepositoryStatus {
        repository_id: repository.id,
        vcs_type: repository.vcs_type,
        clean,
        warning,
        missing_svn_cli,
        summary,
        changes,
    })
}

#[tauri::command]
fn update_repository(app: AppHandle, id: i64) -> Result<Vec<OperationResult>, String> {
    let connection = open_database(&app)?;
    let repository = find_repository_by_id(&connection, id)?
        .ok_or_else(|| "未找到需要更新的仓库".to_string())?;

    let results = match repository.vcs_type.as_str() {
        "git" => vec![git_update_result(&repository.path)],
        "svn" => vec![svn_update_result(&repository.path)],
        "mixed" => vec![
            git_update_result(&repository.path),
            svn_update_result(&repository.path),
        ],
        _ => vec![OperationResult {
            operation: "update".to_string(),
            vcs_type: repository.vcs_type,
            success: false,
            summary: "当前目录未识别为 Git 或 SVN 仓库".to_string(),
            output: String::new(),
            warning: Some("请先重新检测仓库类型。".to_string()),
            missing_svn_cli: false,
        }],
    };

    Ok(results)
}

#[tauri::command]
fn list_repository_files(
    app: AppHandle,
    id: i64,
    relative_path: Option<String>,
) -> Result<RepositoryDirectory, String> {
    let connection = open_database(&app)?;
    let repository = find_repository_by_id(&connection, id)?
        .ok_or_else(|| "未找到需要浏览的仓库".to_string())?;
    let root = PathBuf::from(&repository.path);
    let directory_path = safe_repository_child_path(&root, relative_path.as_deref())?;

    if !directory_path.is_dir() {
        return Err("当前路径不是目录".to_string());
    }

    let current_path = relative_path
        .as_deref()
        .map(normalize_relative_path)
        .transpose()?
        .unwrap_or_default();
    let parent_path = parent_relative_path(&current_path);
    let mut remaining_entries = 650;
    let entries =
        repository_file_entries(&directory_path, &current_path, 0, &mut remaining_entries)?;

    Ok(RepositoryDirectory {
        repository_id: repository.id,
        path: current_path,
        parent_path,
        entries,
    })
}

#[tauri::command]
fn open_svn_cli_download_page(target: String) -> Result<(), String> {
    let url = match target.as_str() {
        "sliksvn" => "https://sliksvn.com/download/",
        _ => "https://tortoisesvn.net/downloads.html",
    };

    open_url(url)
}

#[tauri::command]
fn detect_repository(path: String) -> Result<DetectedRepository, String> {
    let repository_path = normalize_existing_path(path)?;
    let repository_path_string = path_to_display_string(&repository_path)?;
    let name = repository_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("repository")
        .to_string();

    let git_root = run_command([
        "git",
        "-C",
        &repository_path_string,
        "rev-parse",
        "--show-toplevel",
    ]);
    let svn_metadata = detect_svn_metadata(&repository_path_string, &repository_path);

    let has_git = git_root.is_ok();
    let has_svn = svn_metadata.is_ok();
    let vcs_type = match (has_git, has_svn) {
        (true, true) => "mixed",
        (true, false) => "git",
        (false, true) => "svn",
        (false, false) => "unknown",
    }
    .to_string();

    let remote_url = match vcs_type.as_str() {
        "git" | "mixed" => run_command([
            "git",
            "-C",
            &repository_path_string,
            "config",
            "--get",
            "remote.origin.url",
        ])
        .ok(),
        "svn" => svn_metadata
            .as_ref()
            .ok()
            .and_then(|metadata| metadata.remote_url.clone()),
        _ => None,
    };

    let branch_or_revision = match vcs_type.as_str() {
        "git" | "mixed" => run_command([
            "git",
            "-C",
            &repository_path_string,
            "branch",
            "--show-current",
        ])
        .ok(),
        "svn" => svn_metadata
            .as_ref()
            .ok()
            .and_then(|metadata| metadata.revision.clone()),
        _ => None,
    };

    Ok(DetectedRepository {
        path: repository_path_string,
        name,
        vcs_type,
        remote_url,
        branch_or_revision,
    })
}

fn open_database(app: &AppHandle) -> Result<Connection, String> {
    let database_path = database_path(app)?;
    let connection = Connection::open(database_path).map_err(|error| error.to_string())?;
    initialize_database(&connection)?;
    normalize_repository_paths(&connection)?;
    Ok(connection)
}

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join("gvmt.sqlite"))
}

fn initialize_database(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS repositories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                path TEXT NOT NULL UNIQUE,
                vcs_type TEXT NOT NULL,
                remote_url TEXT,
                branch_or_revision TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );",
        )
        .map_err(|error| error.to_string())
}

fn find_repository_by_path(
    connection: &Connection,
    path: &str,
) -> Result<Option<Repository>, String> {
    connection
        .query_row(
            "SELECT id, name, path, vcs_type, remote_url, branch_or_revision, created_at, updated_at
             FROM repositories
             WHERE path = ?1",
            params![path],
            |row| {
                Ok(Repository {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    path: row.get(2)?,
                    vcs_type: row.get(3)?,
                    remote_url: row.get(4)?,
                    branch_or_revision: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            },
        )
        .optional()
        .map_err(|error| error.to_string())
}

fn find_repository_by_id(connection: &Connection, id: i64) -> Result<Option<Repository>, String> {
    connection
        .query_row(
            "SELECT id, name, path, vcs_type, remote_url, branch_or_revision, created_at, updated_at
             FROM repositories
             WHERE id = ?1",
            params![id],
            |row| {
                Ok(Repository {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    path: row.get(2)?,
                    vcs_type: row.get(3)?,
                    remote_url: row.get(4)?,
                    branch_or_revision: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            },
        )
        .optional()
        .map_err(|error| error.to_string())
}

fn normalize_repository_paths(connection: &Connection) -> Result<(), String> {
    let rows = {
        let mut statement = connection
            .prepare("SELECT id, path FROM repositories")
            .map_err(|error| error.to_string())?;

        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        rows
    };

    for (id, path) in rows {
        let normalized_path = strip_windows_extended_path_prefix(&path);
        if normalized_path == path {
            continue;
        }

        let updated = connection
            .execute(
                "UPDATE OR IGNORE repositories
                 SET path = ?1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?2",
                params![normalized_path, id],
            )
            .map_err(|error| error.to_string())?;

        if updated == 0 {
            connection
                .execute("DELETE FROM repositories WHERE id = ?1", params![id])
                .map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

fn normalize_existing_path(path: String) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(path.trim());
    if !candidate.exists() {
        return Err("路径不存在".to_string());
    }
    candidate.canonicalize().map_err(|error| error.to_string())
}

fn path_to_display_string(path: &Path) -> Result<String, String> {
    let value = path
        .to_str()
        .ok_or_else(|| "路径包含无法处理的字符".to_string())?;
    Ok(strip_windows_extended_path_prefix(value))
}

fn strip_windows_extended_path_prefix(path: &str) -> String {
    const EXTENDED_PREFIX: &str = "\\\\?\\";
    const EXTENDED_UNC_PREFIX: &str = "\\\\?\\UNC\\";

    if let Some(rest) = path.strip_prefix(EXTENDED_UNC_PREFIX) {
        format!("\\\\{rest}")
    } else if let Some(rest) = path.strip_prefix(EXTENDED_PREFIX) {
        rest.to_string()
    } else {
        path.to_string()
    }
}

fn safe_repository_child_path(root: &Path, relative_path: Option<&str>) -> Result<PathBuf, String> {
    let root = root.canonicalize().map_err(|error| error.to_string())?;
    let normalized = relative_path
        .map(normalize_relative_path)
        .transpose()?
        .unwrap_or_default();
    let candidate = if normalized.is_empty() {
        root.clone()
    } else {
        root.join(normalized.replace('/', std::path::MAIN_SEPARATOR_STR))
    };
    let canonical = candidate
        .canonicalize()
        .map_err(|error| error.to_string())?;

    if canonical.starts_with(&root) {
        Ok(canonical)
    } else {
        Err("路径超出仓库范围".to_string())
    }
}

fn normalize_relative_path(path: &str) -> Result<String, String> {
    let trimmed = path.trim().replace('\\', "/");
    if trimmed.is_empty() {
        return Ok(String::new());
    }

    let mut parts = Vec::new();
    for part in trimmed.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." || part.contains(':') {
            return Err("路径包含不允许的片段".to_string());
        }
        parts.push(part);
    }

    Ok(parts.join("/"))
}

fn parent_relative_path(path: &str) -> Option<String> {
    if path.is_empty() {
        return None;
    }

    path.rsplit_once('/')
        .map(|(parent, _)| parent.to_string())
        .or_else(|| Some(String::new()))
}

fn repository_file_entries(
    directory_path: &Path,
    current_path: &str,
    depth: usize,
    remaining_entries: &mut usize,
) -> Result<Vec<RepositoryFileEntry>, String> {
    const MAX_TREE_DEPTH: usize = 4;

    if *remaining_entries == 0 {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    for item in fs::read_dir(directory_path).map_err(|error| error.to_string())? {
        if *remaining_entries == 0 {
            break;
        }

        let item = item.map_err(|error| error.to_string())?;
        let file_name = item.file_name().to_string_lossy().to_string();
        if should_hide_repository_entry(&file_name) {
            continue;
        }

        let metadata = item.metadata().map_err(|error| error.to_string())?;
        let is_directory = metadata.is_dir();
        let entry_path = if current_path.is_empty() {
            file_name.clone()
        } else {
            format!("{current_path}/{file_name}")
        };
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
            .map(|value| value.as_secs());

        *remaining_entries -= 1;
        let children = if is_directory && depth < MAX_TREE_DEPTH && *remaining_entries > 0 {
            repository_file_entries(&item.path(), &entry_path, depth + 1, remaining_entries)?
        } else {
            Vec::new()
        };

        entries.push(RepositoryFileEntry {
            name: file_name,
            path: entry_path,
            entry_type: if is_directory { "directory" } else { "file" }.to_string(),
            size: if metadata.is_file() {
                Some(metadata.len())
            } else {
                None
            },
            modified_at,
            children,
        });
    }

    sort_repository_entries(&mut entries);
    Ok(entries)
}

fn sort_repository_entries(entries: &mut [RepositoryFileEntry]) {
    entries.sort_by(|left, right| {
        let left_is_directory = left.entry_type == "directory";
        let right_is_directory = right.entry_type == "directory";
        right_is_directory
            .cmp(&left_is_directory)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    for entry in entries {
        sort_repository_entries(&mut entry.children);
    }
}

fn should_hide_repository_entry(name: &str) -> bool {
    matches!(name, ".git" | ".svn")
}

fn svn_info(path: &str) -> Result<String, String> {
    run_command(["svn", "info", path])
}

fn detect_svn_metadata(path: &str, repository_path: &Path) -> Result<SvnMetadata, String> {
    svn_info(path)
        .map(|info| SvnMetadata {
            remote_url: parse_svn_info_item(&info, "URL"),
            revision: parse_svn_info_item(&info, "Revision"),
        })
        .or_else(|_| detect_svn_metadata_from_wc_db(repository_path))
}

fn parse_svn_info_item(info: &str, label: &str) -> Option<String> {
    let prefix = format!("{label}:");
    info.lines().find_map(|line| {
        line.strip_prefix(&prefix)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
    })
}

fn detect_svn_metadata_from_wc_db(path: &Path) -> Result<SvnMetadata, String> {
    let wc_db_path = find_svn_wc_db(path).ok_or_else(|| "未找到 SVN 工作副本数据库".to_string())?;
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

fn git_status_changes(path: &str) -> Result<Vec<ChangeItem>, String> {
    let output = run_command(["git", "-C", path, "status", "--porcelain=v1"])?;
    Ok(output
        .lines()
        .filter_map(parse_git_status_line)
        .collect::<Vec<_>>())
}

fn parse_git_status_line(line: &str) -> Option<ChangeItem> {
    if line.len() < 4 {
        return None;
    }

    let status_code = &line[..2];
    let raw_path = line[3..].trim();
    let path = raw_path
        .rsplit(" -> ")
        .next()
        .unwrap_or(raw_path)
        .trim_matches('"')
        .to_string();

    Some(ChangeItem {
        path,
        status: git_status_kind(status_code).to_string(),
        vcs_type: "git".to_string(),
    })
}

fn git_status_kind(status_code: &str) -> &'static str {
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

fn svn_status_changes(path: &str) -> Result<Vec<ChangeItem>, String> {
    let output = run_command(["svn", "status", path])?;
    Ok(output
        .lines()
        .filter_map(parse_svn_status_line)
        .collect::<Vec<_>>())
}

fn parse_svn_status_line(line: &str) -> Option<ChangeItem> {
    let status_code = line.chars().next()?;
    if line.trim().is_empty() {
        return None;
    }

    let path = line.get(8..).unwrap_or("").trim();
    if path.is_empty() {
        return None;
    }

    Some(ChangeItem {
        path: path.to_string(),
        status: svn_status_kind(status_code).to_string(),
        vcs_type: "svn".to_string(),
    })
}

fn svn_status_kind(status_code: char) -> &'static str {
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

fn summarize_changes(changes: &[ChangeItem]) -> RepositoryStatusSummary {
    let mut summary = RepositoryStatusSummary {
        total: changes.len(),
        ..RepositoryStatusSummary::default()
    };

    for change in changes {
        match change.status.as_str() {
            "added" => summary.added += 1,
            "modified" => summary.modified += 1,
            "deleted" => summary.deleted += 1,
            "untracked" => summary.untracked += 1,
            "conflicted" => summary.conflicted += 1,
            _ => {}
        }
    }

    summary
}

fn svn_status_warning(error: &str) -> String {
    if is_missing_svn_cli_error(error) {
        "当前环境没有可调用的 svn.exe。TortoiseSVN GUI 可用于识别工作副本，但状态检测仍需要 SVN 命令行工具。可以安装 SlikSVN，或重新安装 / 修改 TortoiseSVN 并勾选 command line client tools。".to_string()
    } else {
        format!("SVN 状态检测失败：{error}")
    }
}

fn git_update_result(path: &str) -> OperationResult {
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

fn svn_update_result(path: &str) -> OperationResult {
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

fn git_update_warning(error: &str) -> String {
    if error.contains("Not possible to fast-forward") || error.contains("divergent") {
        "Git 无法快进更新，请先检查本地提交或分支分叉情况。".to_string()
    } else if error.contains("Your local changes") {
        "Git 更新前需要先处理本地修改。".to_string()
    } else {
        format!("Git 更新失败：{error}")
    }
}

fn is_missing_svn_cli_error(error: &str) -> bool {
    let normalized = error.to_lowercase();
    normalized.contains("the system cannot find the file specified")
        || normalized.contains("program not found")
        || normalized.contains("找不到")
        || normalized.contains("os error 2")
        || normalized.contains("no such file or directory")
}

fn open_url(url: &str) -> Result<(), String> {
    if cfg!(windows) {
        Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", url])
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    } else {
        Err("当前版本仅支持 Windows 打开下载页面".to_string())
    }
}

fn run_command<const N: usize>(parts: [&str; N]) -> Result<String, String> {
    let (program, args) = parts.split_first().ok_or_else(|| "命令为空".to_string())?;
    let resolved_program = resolve_program(program);
    let output = Command::new(&resolved_program)
        .args(args)
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if error.is_empty() {
            format!("命令执行失败：{resolved_program}")
        } else {
            error
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn resolve_program(program: &str) -> String {
    if program != "svn" || !cfg!(windows) {
        return program.to_string();
    }

    svn_executable_candidates()
        .into_iter()
        .find(|candidate| Path::new(candidate).exists())
        .unwrap_or_else(|| program.to_string())
}

fn svn_executable_candidates() -> Vec<String> {
    let mut candidates = vec![
        "C:\\Program Files\\TortoiseSVN\\bin\\svn.exe",
        "C:\\Program Files (x86)\\TortoiseSVN\\bin\\svn.exe",
        "C:\\Program Files\\SlikSvn\\bin\\svn.exe",
        "C:\\Program Files (x86)\\SlikSvn\\bin\\svn.exe",
        "C:\\Program Files\\VisualSVN\\bin\\svn.exe",
    ]
    .into_iter()
    .map(ToOwned::to_owned)
    .collect::<Vec<_>>();

    candidates.extend(
        tortoise_svn_registry_directories()
            .into_iter()
            .map(|directory| {
                Path::new(&directory)
                    .join("bin")
                    .join("svn.exe")
                    .to_string_lossy()
                    .to_string()
            }),
    );

    candidates
}

fn tortoise_svn_registry_directories() -> Vec<String> {
    [
        "HKLM\\SOFTWARE\\TortoiseSVN",
        "HKLM\\SOFTWARE\\WOW6432Node\\TortoiseSVN",
    ]
    .into_iter()
    .filter_map(|key| registry_value(key, "Directory"))
    .collect()
}

fn registry_value(key: &str, value: &str) -> Option<String> {
    let output = Command::new("reg")
        .args(["query", key, "/v", value])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout.lines().find_map(|line| {
        let trimmed = line.trim();
        if !trimmed.starts_with(value) {
            return None;
        }

        trimmed
            .split_once("REG_SZ")
            .map(|(_, path)| path.trim().to_string())
            .filter(|path| !path.is_empty())
    })
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            add_repository,
            detect_repository,
            get_repository_status,
            list_repository_files,
            list_repositories,
            open_svn_cli_download_page,
            refresh_repository,
            update_repository
        ])
        .run(tauri::generate_context!())
        .expect("error while running GVMT");
}
