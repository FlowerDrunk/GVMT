use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::UNIX_EPOCH,
};
use tauri::{AppHandle, Manager};
#[cfg(windows)]
use windows_sys::Win32::Globalization::{GetACP, MultiByteToWideChar};

fn os_str_to_string(value: &OsStr) -> String {
    value
        .to_str()
        .map(String::from)
        .unwrap_or_else(|| value.to_string_lossy().into_owned())
}

fn decode_command_output(bytes: &[u8]) -> String {
    if let Ok(value) = String::from_utf8(bytes.to_vec()) {
        return value;
    }

    #[cfg(windows)]
    {
        if let Some(value) = decode_windows_ansi(bytes) {
            return value;
        }
    }

    String::from_utf8_lossy(bytes).into_owned()
}

#[cfg(windows)]
fn decode_windows_ansi(bytes: &[u8]) -> Option<String> {
    if bytes.is_empty() {
        return Some(String::new());
    }

    unsafe {
        let code_page = GetACP();
        let required = MultiByteToWideChar(
            code_page,
            0,
            bytes.as_ptr(),
            bytes.len() as i32,
            std::ptr::null_mut(),
            0,
        );
        if required <= 0 {
            return None;
        }

        let mut wide = vec![0u16; required as usize];
        let written = MultiByteToWideChar(
            code_page,
            0,
            bytes.as_ptr(),
            bytes.len() as i32,
            wide.as_mut_ptr(),
            wide.len() as i32,
        );
        if written <= 0 {
            return None;
        }
        wide.truncate(written as usize);
        Some(String::from_utf16_lossy(&wide))
    }
}

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiffRequest {
    path: String,
    vcs_type: String,
    status: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CommitFileRequest {
    path: String,
    vcs_type: String,
    status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommitRequest {
    message: String,
    push: bool,
    files: Vec<CommitFileRequest>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryDiff {
    repository_id: i64,
    path: String,
    vcs_type: String,
    status: String,
    content: String,
    is_binary: bool,
    warning: Option<String>,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryFilePreview {
    repository_id: i64,
    path: String,
    name: String,
    size: u64,
    modified_at: Option<u64>,
    content: String,
    is_binary: bool,
    warning: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct IgnoreRules {
    vcs_type: String,
    gitignore_path: Option<String>,
    gitignore_content: Option<String>,
    svn_entries: Vec<SvnIgnoreEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SvnIgnoreEntry {
    directory: String,
    rules: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateGitignoreRequest {
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddIgnoreRuleRequest {
    path: String,
    vcs_type: String,
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
fn delete_repository(app: AppHandle, id: i64) -> Result<(), String> {
    let connection = open_database(&app)?;
    let deleted = connection
        .execute("DELETE FROM repositories WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;

    if deleted == 0 {
        return Err("未找到需要删除的仓库记录".to_string());
    }

    Ok(())
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
fn get_repository_diff(
    app: AppHandle,
    id: i64,
    input: DiffRequest,
) -> Result<RepositoryDiff, String> {
    let connection = open_database(&app)?;
    let repository = find_repository_by_id(&connection, id)?
        .ok_or_else(|| "未找到需要查看 diff 的仓库".to_string())?;
    let path = normalize_relative_path(&input.path)?;
    if path.is_empty() {
        return Err("请选择一个文件查看 diff".to_string());
    }

    let (content, is_binary, warning) = if input.status == "untracked" {
        untracked_file_preview(&repository.path, &path)?
    } else {
        match input.vcs_type.as_str() {
            "git" => (git_file_diff(&repository.path, &path)?, false, None),
            "svn" => (svn_file_diff(&repository.path, &path)?, false, None),
            _ => {
                return Err("当前变更类型暂不支持 diff 预览".to_string());
            }
        }
    };

    Ok(RepositoryDiff {
        repository_id: repository.id,
        path,
        vcs_type: input.vcs_type,
        status: input.status,
        content,
        is_binary,
        warning,
    })
}

#[tauri::command]
fn commit_repository(
    app: AppHandle,
    id: i64,
    input: CommitRequest,
) -> Result<Vec<OperationResult>, String> {
    let message = input.message.trim();
    if message.is_empty() {
        return Err("请输入提交信息".to_string());
    }
    if input.files.is_empty() {
        return Err("请选择需要提交的文件".to_string());
    }

    let connection = open_database(&app)?;
    let repository = find_repository_by_id(&connection, id)?
        .ok_or_else(|| "未找到需要提交的仓库".to_string())?;

    let mut results = Vec::new();
    let git_files = input
        .files
        .iter()
        .filter(|file| file.vcs_type == "git")
        .cloned()
        .collect::<Vec<_>>();
    let svn_files = input
        .files
        .iter()
        .filter(|file| file.vcs_type == "svn")
        .cloned()
        .collect::<Vec<_>>();

    if !git_files.is_empty() {
        results.extend(git_commit_results(
            &repository.path,
            message,
            input.push,
            &git_files,
        ));
    }
    if !svn_files.is_empty() {
        results.push(svn_commit_result(&repository.path, message, &svn_files));
    }

    if results.is_empty() {
        return Err("当前选择的文件没有可提交的 Git / SVN 变更".to_string());
    }

    Ok(results)
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
    let entries = repository_file_entries(&directory_path, &current_path)?;

    Ok(RepositoryDirectory {
        repository_id: repository.id,
        path: current_path,
        parent_path,
        entries,
    })
}

#[tauri::command]
fn read_repository_file(
    app: AppHandle,
    id: i64,
    relative_path: String,
) -> Result<RepositoryFilePreview, String> {
    let connection = open_database(&app)?;
    let repository = find_repository_by_id(&connection, id)?
        .ok_or_else(|| "未找到需要预览的仓库".to_string())?;
    let normalized_path = normalize_relative_path(&relative_path)?;
    if normalized_path.is_empty() {
        return Err("请选择一个文件进行预览".to_string());
    }

    let root = PathBuf::from(&repository.path);
    let file_path = safe_repository_child_path(&root, Some(&normalized_path))?;
    if !file_path.is_file() {
        return Err("当前路径不是可预览的文件".to_string());
    }

    repository_file_preview(repository.id, &file_path, &normalized_path)
}

#[tauri::command]
fn get_ignore_rules(app: AppHandle, id: i64) -> Result<IgnoreRules, String> {
    let connection = open_database(&app)?;
    let repository =
        find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;

    let mut gitignore_path = None;
    let mut gitignore_content = None;
    let mut svn_entries = Vec::new();

    if repository.vcs_type == "git" || repository.vcs_type == "mixed" {
        let gitignore = Path::new(&repository.path).join(".gitignore");
        gitignore_path = Some(String::from(".gitignore"));
        if gitignore.exists() {
            gitignore_content = Some(fs::read_to_string(&gitignore).unwrap_or_default());
        }
    }

    if repository.vcs_type == "svn" || repository.vcs_type == "mixed" {
        match run_command(["svn", "propget", "svn:ignore", "-R", &repository.path]) {
            Ok(output) => {
                if !output.trim().is_empty() {
                    svn_entries = parse_svn_ignore_recursive(&output);
                }
            }
            Err(_) => {} // No svn:ignore properties set yet
        }
    }

    Ok(IgnoreRules {
        vcs_type: repository.vcs_type,
        gitignore_path,
        gitignore_content,
        svn_entries,
    })
}

#[tauri::command]
fn add_ignore_rule(
    app: AppHandle,
    id: i64,
    input: AddIgnoreRuleRequest,
) -> Result<OperationResult, String> {
    let connection = open_database(&app)?;
    let repository =
        find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;
    let normalized_path = normalize_relative_path(&input.path)?;

    match input.vcs_type.as_str() {
        "git" => gitignore_append_rule(&repository.path, &normalized_path),
        "svn" => svn_ignore_append_rule(&repository.path, &normalized_path),
        _ => Err("无法识别的版本控制类型".to_string()),
    }
}

#[tauri::command]
fn update_gitignore(
    app: AppHandle,
    id: i64,
    input: UpdateGitignoreRequest,
) -> Result<OperationResult, String> {
    let connection = open_database(&app)?;
    let repository =
        find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;

    let gitignore = Path::new(&repository.path).join(".gitignore");
    fs::write(&gitignore, input.content.as_bytes()).map_err(|error| error.to_string())?;

    Ok(OperationResult {
        operation: "ignore".to_string(),
        vcs_type: "git".to_string(),
        success: true,
        summary: "已更新 .gitignore".to_string(),
        output: String::new(),
        warning: None,
        missing_svn_cli: false,
    })
}

#[tauri::command]
fn update_svn_ignore(
    app: AppHandle,
    id: i64,
    directory: String,
    rules: Vec<String>,
) -> Result<OperationResult, String> {
    let connection = open_database(&app)?;
    let repository =
        find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;

    let dir_path = safe_repository_child_path(
        Path::new(&repository.path),
        if directory.is_empty() {
            None
        } else {
            Some(&directory)
        },
    )?;
    let dir_str = os_str_to_string(dir_path.as_os_str());
    let value = rules.join("\n");

    run_command_args(
        "svn",
        &[
            "propset".into(),
            "svn:ignore".into(),
            value.clone(),
            dir_str,
        ],
    )?;

    Ok(OperationResult {
        operation: "ignore".to_string(),
        vcs_type: "svn".to_string(),
        success: true,
        summary: format!(
            "已更新 svn:ignore — {}",
            if directory.is_empty() {
                "仓库根目录"
            } else {
                &directory
            }
        ),
        output: String::new(),
        warning: None,
        missing_svn_cli: false,
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
) -> Result<Vec<RepositoryFileEntry>, String> {
    let mut entries = Vec::new();
    for item in fs::read_dir(directory_path).map_err(|error| error.to_string())? {
        let item = item.map_err(|error| error.to_string())?;
        let file_name = os_str_to_string(&item.file_name());
        if should_hide_repository_entry(&file_name) {
            continue;
        }

        let metadata = match item.metadata() {
            Ok(value) => value,
            Err(_) => continue,
        };
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
            children: Vec::new(),
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
    // Skip the status chars and the space separator to get the path
    let raw_path = line[3..].trim();
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

fn git_file_diff(root_path: &str, relative_path: &str) -> Result<String, String> {
    let diff = run_command(["git", "-C", root_path, "diff", "HEAD", "--", relative_path])
        .or_else(|_| run_command(["git", "-C", root_path, "diff", "--", relative_path]))?;
    Ok(if diff.trim().is_empty() {
        "当前文件没有可展示的 Git diff，可能是仅属性变化或文件内容尚未加入跟踪。".to_string()
    } else {
        diff
    })
}

fn svn_file_diff(root_path: &str, relative_path: &str) -> Result<String, String> {
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

fn untracked_file_preview(
    root_path: &str,
    relative_path: &str,
) -> Result<(String, bool, Option<String>), String> {
    const MAX_PREVIEW_BYTES: usize = 160 * 1024;
    const MAX_PREVIEW_LINES: usize = 500;

    let root = Path::new(root_path)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let candidate = root.join(relative_path.replace('/', std::path::MAIN_SEPARATOR_STR));
    let canonical = candidate
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !canonical.starts_with(&root) {
        return Err("文件路径超出仓库范围".to_string());
    }

    let bytes = fs::read(&canonical).map_err(|error| error.to_string())?;
    if bytes.contains(&0) {
        return Ok((
            "未跟踪文件疑似为二进制文件，暂不展示内容预览。".to_string(),
            true,
            Some("二进制文件不会展开为文本 diff。".to_string()),
        ));
    }

    let warning = if bytes.len() > MAX_PREVIEW_BYTES {
        Some("文件较大，仅展示前 160KB 内容。".to_string())
    } else {
        None
    };
    let slice_end = bytes.len().min(MAX_PREVIEW_BYTES);
    let text = String::from_utf8_lossy(&bytes[..slice_end]);
    let mut content = format!("--- /dev/null\n+++ b/{relative_path}\n@@\n");
    for line in text.lines().take(MAX_PREVIEW_LINES) {
        content.push('+');
        content.push_str(line);
        content.push('\n');
    }
    if text.lines().count() > MAX_PREVIEW_LINES {
        content.push_str("+... 内容过长，已截断预览\n");
    }

    Ok((content, false, warning))
}

fn repository_file_preview(
    repository_id: i64,
    file_path: &Path,
    relative_path: &str,
) -> Result<RepositoryFilePreview, String> {
    const MAX_PREVIEW_BYTES: usize = 256 * 1024;
    const MAX_PREVIEW_LINES: usize = 1200;

    let metadata = file_path.metadata().map_err(|error| error.to_string())?;
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_secs());
    let name = file_path
        .file_name()
        .map(os_str_to_string)
        .unwrap_or_else(|| relative_path.to_string());
    let bytes = fs::read(file_path).map_err(|error| error.to_string())?;

    if bytes.contains(&0) {
        return Ok(RepositoryFilePreview {
            repository_id,
            path: relative_path.to_string(),
            name,
            size: metadata.len(),
            modified_at,
            content: String::new(),
            is_binary: true,
            warning: Some("二进制文件暂不展示内容预览。".to_string()),
        });
    }

    let slice_end = bytes.len().min(MAX_PREVIEW_BYTES);
    let mut content = decode_command_output(&bytes[..slice_end]);
    let mut warning = if bytes.len() > MAX_PREVIEW_BYTES {
        Some("文件较大，仅展示前 256KB 内容。".to_string())
    } else {
        None
    };

    let line_count = content.lines().count();
    if line_count > MAX_PREVIEW_LINES {
        content = content
            .lines()
            .take(MAX_PREVIEW_LINES)
            .collect::<Vec<_>>()
            .join("\n");
        warning = Some(match warning {
            Some(value) => format!("{value} 同时仅展示前 {MAX_PREVIEW_LINES} 行。"),
            None => format!("文件行数较多，仅展示前 {MAX_PREVIEW_LINES} 行。"),
        });
    }

    Ok(RepositoryFilePreview {
        repository_id,
        path: relative_path.to_string(),
        name,
        size: metadata.len(),
        modified_at,
        content,
        is_binary: false,
        warning,
    })
}

fn svn_status_changes(path: &str) -> Result<Vec<ChangeItem>, String> {
    let output = run_command(["svn", "status", path])?;
    Ok(output
        .lines()
        .filter_map(|line| parse_svn_status_line(line, path))
        .collect::<Vec<_>>())
}

fn parse_svn_status_line(line: &str, root_path: &str) -> Option<ChangeItem> {
    let status_code = line.chars().next()?;
    if line.trim().is_empty() {
        return None;
    }

    let path = line.get(8..).unwrap_or("").trim();
    if path.is_empty() {
        return None;
    }

    Some(ChangeItem {
        path: repository_relative_change_path(path, root_path),
        status: svn_status_kind(status_code).to_string(),
        vcs_type: "svn".to_string(),
    })
}

fn repository_relative_change_path(path: &str, root_path: &str) -> String {
    let normalized_path = strip_windows_extended_path_prefix(path).replace('\\', "/");
    let normalized_root = strip_windows_extended_path_prefix(root_path).replace('\\', "/");
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
        Path::new(root_path).canonicalize(),
        Path::new(path).canonicalize(),
    ) {
        if let Ok(relative) = candidate.strip_prefix(root) {
            return os_str_to_string(relative.as_os_str()).replace('\\', "/");
        }
    }

    normalized_path
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

fn git_commit_results(
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

    let mut add_args = vec![
        "-C".to_string(),
        root_path.to_string(),
        "add".to_string(),
        "--".to_string(),
    ];
    add_args.extend(normalized_paths.iter().cloned());
    if let Err(error) = run_command_args("git", &add_args) {
        results.push(failed_operation(
            "commit",
            "git",
            format!("Git add 失败：{error}"),
            false,
        ));
        return results;
    }

    let mut commit_args = vec![
        "-C".to_string(),
        root_path.to_string(),
        "commit".to_string(),
        "-m".to_string(),
        message.to_string(),
        "--".to_string(),
    ];
    commit_args.extend(normalized_paths.iter().cloned());
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

fn svn_commit_result(
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

fn normalized_commit_paths(files: &[CommitFileRequest]) -> Result<Vec<String>, String> {
    files
        .iter()
        .map(|file| normalize_relative_path(&file.path))
        .collect::<Result<Vec<_>, _>>()
}

fn svn_absolute_path(root_path: &str, relative_path: &str) -> Result<String, String> {
    let relative = normalize_relative_path(relative_path)?;
    let joined = Path::new(root_path).join(relative.replace('/', std::path::MAIN_SEPARATOR_STR));
    Ok(os_str_to_string(joined.as_os_str()))
}

fn success_operation(
    operation: &str,
    vcs_type: &str,
    summary: &str,
    output: String,
) -> OperationResult {
    OperationResult {
        operation: operation.to_string(),
        vcs_type: vcs_type.to_string(),
        success: true,
        summary: summary.to_string(),
        output,
        warning: None,
        missing_svn_cli: false,
    }
}

fn failed_operation(
    operation: &str,
    vcs_type: &str,
    warning: String,
    missing_svn_cli: bool,
) -> OperationResult {
    OperationResult {
        operation: operation.to_string(),
        vcs_type: vcs_type.to_string(),
        success: false,
        summary: format!("{} 操作失败", vcs_type.to_uppercase()),
        output: String::new(),
        warning: Some(warning),
        missing_svn_cli,
    }
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
        let error = decode_command_output(&output.stderr).trim().to_string();
        return Err(if error.is_empty() {
            format!("命令执行失败：{resolved_program}")
        } else {
            error
        });
    }

    Ok(decode_command_output(&output.stdout).trim().to_string())
}

fn run_command_args(program: &str, args: &[String]) -> Result<String, String> {
    let resolved_program = resolve_program(program);
    let output = Command::new(&resolved_program)
        .args(args)
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        let error = decode_command_output(&output.stderr).trim().to_string();
        return Err(if error.is_empty() {
            format!("命令执行失败：{resolved_program}")
        } else {
            error
        });
    }

    Ok(decode_command_output(&output.stdout).trim().to_string())
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

    let stdout = decode_command_output(&output.stdout);
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

fn parse_svn_ignore_recursive(output: &str) -> Vec<SvnIgnoreEntry> {
    let mut entries = Vec::new();
    let mut current_dir: Option<String> = None;
    let mut current_rules: Vec<String> = Vec::new();

    for line in output.lines() {
        if line.trim().is_empty() {
            if let Some(dir) = current_dir.take() {
                entries.push(SvnIgnoreEntry {
                    directory: dir,
                    rules: std::mem::take(&mut current_rules),
                });
            }
            continue;
        }

        if let Some((dir, first_rule)) = line.split_once(" - ") {
            if let Some(prev_dir) = current_dir.take() {
                entries.push(SvnIgnoreEntry {
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
            entries.push(SvnIgnoreEntry {
                directory: dir,
                rules: current_rules,
            });
        }
    }

    entries
}

fn gitignore_append_rule(root_path: &str, rule: &str) -> Result<OperationResult, String> {
    let gitignore = Path::new(root_path).join(".gitignore");
    let mut content = if gitignore.exists() {
        fs::read_to_string(&gitignore).unwrap_or_default()
    } else {
        String::new()
    };

    let normalized_rule = rule.replace('\\', "/");
    if content.lines().any(|line| line.trim() == normalized_rule) {
        return Ok(OperationResult {
            operation: "ignore".to_string(),
            vcs_type: "git".to_string(),
            success: true,
            summary: format!("规则已在 .gitignore 中存在：{normalized_rule}"),
            output: String::new(),
            warning: None,
            missing_svn_cli: false,
        });
    }

    if !content.is_empty() && !content.ends_with('\n') {
        content.push('\n');
    }
    content.push_str(&normalized_rule);
    content.push('\n');

    fs::write(&gitignore, content.as_bytes()).map_err(|error| error.to_string())?;

    Ok(OperationResult {
        operation: "ignore".to_string(),
        vcs_type: "git".to_string(),
        success: true,
        summary: format!("已添加 Git 忽略规则：{normalized_rule}"),
        output: String::new(),
        warning: None,
        missing_svn_cli: false,
    })
}

fn svn_ignore_append_rule(root_path: &str, relative_path: &str) -> Result<OperationResult, String> {
    let root = Path::new(root_path);
    let file_name = relative_path
        .rsplit_once('/')
        .map(|(_, name)| name)
        .unwrap_or(relative_path);

    let parent_dir = relative_path
        .rsplit_once('/')
        .map(|(parent, _)| parent)
        .unwrap_or("");
    let dir_path = if parent_dir.is_empty() {
        root.to_path_buf()
    } else {
        root.join(parent_dir.replace('/', std::path::MAIN_SEPARATOR_STR))
    };
    let dir_str = os_str_to_string(dir_path.as_os_str());

    let mut existing = Vec::new();
    if let Ok(output) = run_command(["svn", "propget", "svn:ignore", &dir_str]) {
        for line in output.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                existing.push(trimmed.to_string());
            }
        }
    }

    if existing.iter().any(|rule| rule == file_name) {
        return Ok(OperationResult {
            operation: "ignore".to_string(),
            vcs_type: "svn".to_string(),
            success: true,
            summary: format!("规则已在 svn:ignore 中存在：{file_name}"),
            output: String::new(),
            warning: None,
            missing_svn_cli: false,
        });
    }

    existing.push(file_name.to_string());
    let value = existing.join("\n");

    run_command_args(
        "svn",
        &["propset".into(), "svn:ignore".into(), value, dir_str],
    )?;

    Ok(OperationResult {
        operation: "ignore".to_string(),
        vcs_type: "svn".to_string(),
        success: true,
        summary: format!("已添加 SVN 忽略规则：{file_name}"),
        output: String::new(),
        warning: None,
        missing_svn_cli: false,
    })
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            add_ignore_rule,
            add_repository,
            commit_repository,
            delete_repository,
            detect_repository,
            get_ignore_rules,
            get_repository_diff,
            get_repository_status,
            list_repository_files,
            list_repositories,
            open_svn_cli_download_page,
            read_repository_file,
            refresh_repository,
            update_gitignore,
            update_repository,
            update_svn_ignore
        ])
        .run(tauri::generate_context!())
        .expect("error while running GVMT");
}
