use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    env,
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{Mutex, OnceLock},
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
use windows_sys::Win32::Globalization::{GetACP, MultiByteToWideChar};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn new_command(program: &str) -> Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

static STARTUP_CONTEXT: OnceLock<Mutex<Option<StartupContext>>> = OnceLock::new();

#[cfg(windows)]
fn show_message_box(title: &str, message: &str) {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_OK, MB_ICONINFORMATION, MB_ICONERROR};

    let title_wide: Vec<u16> = OsStr::new(title).encode_wide().chain(Some(0)).collect();
    let msg_wide: Vec<u16> = OsStr::new(message).encode_wide().chain(Some(0)).collect();
    let icon = if message.contains("失败") || message.contains("错误") {
        MB_ICONERROR
    } else {
        MB_ICONINFORMATION
    };
    unsafe {
        MessageBoxW(std::ptr::null_mut(), msg_wide.as_ptr(), title_wide.as_ptr(), MB_OK | icon);
    }
}

#[cfg(not(windows))]
fn show_message_box(title: &str, message: &str) {
    eprintln!("{title}: {message}");
}

fn database_path_fallback() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(appdata) = env::var("APPDATA") {
            return PathBuf::from(appdata).join("com.flowerdrunk.gvmt").join("gvmt.sqlite");
        }
    }
    #[cfg(not(windows))]
    {
        if let Ok(home) = env::var("HOME") {
            return PathBuf::from(home).join(".local/share/com.flowerdrunk.gvmt").join("gvmt.sqlite");
        }
    }
    PathBuf::from("gvmt.sqlite")
}

fn do_update_repository(path: &str) -> Result<String, String> {
    let detected = detect_repository(path.to_string())?;

    let db_path = database_path_fallback();
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let connection = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // Find or create repo
    let mut stmt = connection
        .prepare("SELECT id FROM repositories WHERE path = ?1")
        .map_err(|e| e.to_string())?;
    let existing: Option<i64> = stmt
        .query_row(params![detected.path], |row| row.get(0))
        .optional()
        .map_err(|e| e.to_string())?;

    let id = if let Some(id) = existing {
        id
    } else {
        connection
            .execute(
                "INSERT INTO repositories (name, path, vcs_type, remote_url, branch_or_revision)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![detected.name, detected.path, detected.vcs_type, detected.remote_url, detected.branch_or_revision],
            )
            .map_err(|e| e.to_string())?;
        connection.last_insert_rowid()
    };

    let results = match detected.vcs_type.as_str() {
        "git" => {
            let pull_out = run_command(["git", "-C", path, "pull", "--ff-only"])?;
            vec![OperationResult {
                operation: "update".to_string(), vcs_type: "git".to_string(),
                success: true,
                summary: if pull_out.contains("Already up to date") { "Git 已是最新".to_string() } else { "Git 更新完成".to_string() },
                output: pull_out, warning: None, missing_svn_cli: false,
            }]
        }
        "svn" => {
            let update_out = run_command(["svn", "update", path])?;
            vec![OperationResult {
                operation: "update".to_string(), vcs_type: "svn".to_string(),
                success: true, summary: "SVN 更新完成".to_string(),
                output: update_out, warning: None, missing_svn_cli: false,
            }]
        }
        _ => return Err("当前目录未识别为 Git 或 SVN 仓库".to_string()),
    };

    let failed: Vec<_> = results.iter().filter(|r| !r.success).collect();
    if failed.is_empty() {
        Ok("更新完成".to_string())
    } else {
        Ok(format!("{} 个步骤失败", failed.len()))
    }
}

pub fn execute_background_action() -> bool {
    let context = match parse_startup_context() {
        Some(ctx) => ctx,
        None => return false,
    };

    if context.action == "open" || context.action == "commit" {
        STARTUP_CONTEXT
            .get_or_init(|| Mutex::new(None))
            .lock()
            .ok()
            .map(|mut guard| *guard = Some(context));
        return false;
    }

    if context.action == "detect" {
        match detect_repository(context.path.clone()) {
            Ok(detected) => show_message_box(
                "GVMT — 仓库检测",
                &format!("路径：{}\n类型：{}\n名称：{}", detected.path, detected.vcs_type, detected.name),
            ),
            Err(error) => show_message_box("GVMT — 检测失败", &error),
        }
        return true;
    }

    if context.action == "update" {
        let path = context.path.clone();
        let result = std::thread::spawn(move || do_update_repository(&path)).join()
            .unwrap_or_else(|_| Err("后台线程异常".to_string()));

        match result {
            Ok(summary) => show_message_box("GVMT — 更新仓库", &format!("路径：{}\n{}", context.path, summary)),
            Err(error) => show_message_box("GVMT — 更新失败", &error),
        }
        return true;
    }

    false
}

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

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StartupContext {
    action: String,
    path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowsContextMenuStatus {
    supported: bool,
    installed: bool,
    executable_path: Option<String>,
    warning: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Copy)]
enum QualityCheckType {
    #[serde(rename = "typescriptBuild")]
    TypeScriptBuild,
    #[serde(rename = "playwrightUi")]
    PlaywrightUi,
    #[serde(rename = "cargoCheck")]
    CargoCheck,
}

#[derive(Debug, Clone)]
struct QualityCheckDefinition {
    check_type: QualityCheckType,
    label: &'static str,
    command: &'static str,
    program: &'static str,
    args: Vec<String>,
    cwd: PathBuf,
    unavailable_reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct QualityCheckTemplate {
    check_type: String,
    label: String,
    command: String,
    available: bool,
    unavailable_reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct QualityCheckResult {
    check_type: String,
    label: String,
    command: String,
    status: String,
    success: bool,
    started_at: u64,
    finished_at: u64,
    duration_ms: u64,
    summary: String,
    output: String,
    warning: Option<String>,
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
fn consume_startup_context() -> Result<Option<StartupContext>, String> {
    let mutex = STARTUP_CONTEXT.get_or_init(|| Mutex::new(parse_startup_context()));
    let mut context = mutex.lock().map_err(|error| error.to_string())?;
    Ok(context.take())
}

#[tauri::command]
fn get_windows_context_menu_status() -> Result<WindowsContextMenuStatus, String> {
    if !cfg!(windows) {
        return Ok(WindowsContextMenuStatus {
            supported: false,
            installed: false,
            executable_path: None,
            warning: Some("当前平台不支持 Windows 右键菜单。".to_string()),
        });
    }

    let executable_path = current_executable_path()?;
    Ok(WindowsContextMenuStatus {
        supported: true,
        installed: windows_context_menu_installed(),
        executable_path: Some(executable_path),
        warning: None,
    })
}

#[tauri::command]
fn install_windows_context_menu() -> Result<WindowsContextMenuStatus, String> {
    if !cfg!(windows) {
        return Err("当前平台不支持 Windows 右键菜单。".to_string());
    }

    let executable_path = current_executable_path()?;
    install_context_menu_root(
        "HKCU\\Software\\Classes\\Directory\\shell\\GVMT",
        &executable_path,
        "%1",
    )?;
    install_context_menu_root(
        "HKCU\\Software\\Classes\\Directory\\Background\\shell\\GVMT",
        &executable_path,
        "%V",
    )?;

    Ok(WindowsContextMenuStatus {
        supported: true,
        installed: windows_context_menu_installed(),
        executable_path: Some(executable_path),
        warning: None,
    })
}

#[tauri::command]
fn uninstall_windows_context_menu() -> Result<WindowsContextMenuStatus, String> {
    if !cfg!(windows) {
        return Err("当前平台不支持 Windows 右键菜单。".to_string());
    }

    for root in windows_context_menu_roots() {
        let _ = run_command_args("reg", &["delete".into(), root.to_string(), "/f".into()]);
    }

    get_windows_context_menu_status()
}

#[tauri::command]
fn list_quality_checks(app: AppHandle, id: i64) -> Result<Vec<QualityCheckTemplate>, String> {
    let connection = open_database(&app)?;
    let repository = find_repository_by_id(&connection, id)?
        .ok_or_else(|| "未找到需要检查的仓库".to_string())?;

    Ok([
        QualityCheckType::TypeScriptBuild,
        QualityCheckType::PlaywrightUi,
        QualityCheckType::CargoCheck,
    ]
    .into_iter()
    .map(|check_type| quality_check_definition(&repository.path, check_type).into_template())
    .collect())
}

#[tauri::command]
async fn run_quality_check(
    app: AppHandle,
    id: i64,
    check_type: QualityCheckType,
) -> Result<QualityCheckResult, String> {
    let connection = open_database(&app)?;
    let repository = find_repository_by_id(&connection, id)?
        .ok_or_else(|| "未找到需要检查的仓库".to_string())?;
    let definition = quality_check_definition(&repository.path, check_type);

    if let Some(reason) = &definition.unavailable_reason {
        return Ok(definition.unavailable_result(reason));
    }

    tauri::async_runtime::spawn_blocking(move || definition.run())
        .await
        .map_err(|error| format!("质量检查任务启动失败：{error}"))
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

fn status_path_after_git_status(line: &str) -> &str {
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

fn status_path_after_svn_status(line: &str) -> &str {
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

fn slice_from_char(value: &str, char_index: usize) -> Option<&str> {
    if char_index == 0 {
        return Some(value);
    }

    value
        .char_indices()
        .nth(char_index)
        .map(|(index, _)| &value[index..])
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

impl QualityCheckType {
    fn key(self) -> &'static str {
        match self {
            QualityCheckType::TypeScriptBuild => "typescriptBuild",
            QualityCheckType::PlaywrightUi => "playwrightUi",
            QualityCheckType::CargoCheck => "cargoCheck",
        }
    }

    fn label(self) -> &'static str {
        match self {
            QualityCheckType::TypeScriptBuild => "TypeScript build",
            QualityCheckType::PlaywrightUi => "Playwright UI 测试",
            QualityCheckType::CargoCheck => "Rust cargo check",
        }
    }
}

impl QualityCheckDefinition {
    fn into_template(self) -> QualityCheckTemplate {
        QualityCheckTemplate {
            check_type: self.check_type.key().to_string(),
            label: self.label.to_string(),
            command: self.command.to_string(),
            available: self.unavailable_reason.is_none(),
            unavailable_reason: self.unavailable_reason,
        }
    }

    fn unavailable_result(&self, reason: &str) -> QualityCheckResult {
        let now = now_epoch_seconds();
        QualityCheckResult {
            check_type: self.check_type.key().to_string(),
            label: self.label.to_string(),
            command: self.command.to_string(),
            status: "failed".to_string(),
            success: false,
            started_at: now,
            finished_at: now,
            duration_ms: 0,
            summary: format!("{} 不可用", self.label),
            output: reason.to_string(),
            warning: Some(reason.to_string()),
        }
    }

    fn run(&self) -> QualityCheckResult {
        let started_at = now_epoch_seconds();
        let timer = Instant::now();
        let resolved_program = resolve_program(self.program);
        let output = new_command(&resolved_program)
            .current_dir(&self.cwd)
            .args(&self.args)
            .output();
        let finished_at = now_epoch_seconds();
        let duration_ms = timer.elapsed().as_millis().min(u128::from(u64::MAX)) as u64;

        match output {
            Ok(output) => {
                let stdout = decode_command_output(&output.stdout);
                let stderr = decode_command_output(&output.stderr);
                let combined = combine_command_streams(&stdout, &stderr);
                let display_output = summarize_check_output(&combined);
                let success = output.status.success();
                let exit_code = output
                    .status
                    .code()
                    .map(|code| code.to_string())
                    .unwrap_or_else(|| "unknown".to_string());

                QualityCheckResult {
                    check_type: self.check_type.key().to_string(),
                    label: self.label.to_string(),
                    command: self.command.to_string(),
                    status: if success { "success" } else { "failed" }.to_string(),
                    success,
                    started_at,
                    finished_at,
                    duration_ms,
                    summary: if success {
                        format!("{} 通过，用时 {}", self.label, format_duration(duration_ms))
                    } else {
                        format!("{} 失败，退出码 {}", self.label, exit_code)
                    },
                    output: if display_output.is_empty() {
                        "命令执行完成，没有额外输出。".to_string()
                    } else {
                        display_output
                    },
                    warning: if success {
                        None
                    } else {
                        Some(format!("{} 执行失败，请查看输出摘要。", self.command))
                    },
                }
            }
            Err(error) => QualityCheckResult {
                check_type: self.check_type.key().to_string(),
                label: self.label.to_string(),
                command: self.command.to_string(),
                status: "failed".to_string(),
                success: false,
                started_at,
                finished_at,
                duration_ms,
                summary: format!("{} 启动失败", self.label),
                output: error.to_string(),
                warning: Some(format!("无法启动 {}：{}", self.command, error)),
            },
        }
    }
}

fn quality_check_definition(
    root_path: &str,
    check_type: QualityCheckType,
) -> QualityCheckDefinition {
    let root = PathBuf::from(root_path);
    match check_type {
        QualityCheckType::TypeScriptBuild => npm_script_check(
            check_type,
            "npm run build",
            "build",
            root,
            "package.json 中没有 build 脚本，无法运行 TypeScript build。",
        ),
        QualityCheckType::PlaywrightUi => npm_script_check(
            check_type,
            "npm run test:ui",
            "test:ui",
            root,
            "package.json 中没有 test:ui 脚本，无法运行 Playwright UI 测试。",
        ),
        QualityCheckType::CargoCheck => cargo_check_definition(check_type, root),
    }
}

fn npm_script_check(
    check_type: QualityCheckType,
    command: &'static str,
    script: &str,
    root: PathBuf,
    missing_script_message: &str,
) -> QualityCheckDefinition {
    let package_json = root.join("package.json");
    let unavailable_reason = if !package_json.exists() {
        Some("当前仓库没有 package.json，无法运行 npm 检查。".to_string())
    } else if !package_json_has_script(&package_json, script) {
        Some(missing_script_message.to_string())
    } else {
        None
    };

    QualityCheckDefinition {
        check_type,
        label: check_type.label(),
        command,
        program: "npm",
        args: vec!["run".to_string(), script.to_string()],
        cwd: root,
        unavailable_reason,
    }
}

fn cargo_check_definition(check_type: QualityCheckType, root: PathBuf) -> QualityCheckDefinition {
    let src_tauri = root.join("src-tauri");
    let cwd = if src_tauri.join("Cargo.toml").exists() {
        src_tauri
    } else {
        root.clone()
    };
    let unavailable_reason = if cwd.join("Cargo.toml").exists() {
        None
    } else {
        Some("当前仓库没有 Cargo.toml，无法运行 cargo check。".to_string())
    };

    QualityCheckDefinition {
        check_type,
        label: check_type.label(),
        command: "cargo check",
        program: "cargo",
        args: vec!["check".to_string()],
        cwd,
        unavailable_reason,
    }
}

fn package_json_has_script(package_json: &Path, script: &str) -> bool {
    fs::read_to_string(package_json)
        .ok()
        .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
        .and_then(|value| {
            value
                .get("scripts")
                .and_then(|scripts| scripts.get(script))
                .cloned()
        })
        .is_some()
}

fn combine_command_streams(stdout: &str, stderr: &str) -> String {
    match (stdout.trim().is_empty(), stderr.trim().is_empty()) {
        (true, true) => String::new(),
        (false, true) => stdout.trim().to_string(),
        (true, false) => stderr.trim().to_string(),
        (false, false) => format!("{}\n\n{}", stdout.trim(), stderr.trim()),
    }
}

fn summarize_check_output(output: &str) -> String {
    const MAX_LINES: usize = 80;
    const MAX_CHARS: usize = 12_000;

    let lines = output.lines().collect::<Vec<_>>();
    let tail = if lines.len() > MAX_LINES {
        lines[lines.len() - MAX_LINES..].join("\n")
    } else {
        output.to_string()
    };

    let mut chars = tail.chars().collect::<Vec<_>>();
    if chars.len() > MAX_CHARS {
        chars = chars[chars.len() - MAX_CHARS..].to_vec();
        format!("...{}", chars.into_iter().collect::<String>())
    } else {
        tail
    }
}

fn format_duration(duration_ms: u64) -> String {
    if duration_ms < 1_000 {
        format!("{duration_ms}ms")
    } else {
        format!("{:.1}s", duration_ms as f64 / 1_000.0)
    }
}

fn now_epoch_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

fn parse_startup_context() -> Option<StartupContext> {
    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        let action = match arg.as_str() {
            "--gvmt-open" => "open",
            "--gvmt-detect" => "detect",
            "--gvmt-update" => "update",
            "--gvmt-commit" => "commit",
            _ => continue,
        };
        let path = args.next()?.trim_matches('"').to_string();
        if path.trim().is_empty() {
            return None;
        }

        return Some(StartupContext {
            action: action.to_string(),
            path,
        });
    }

    None
}

fn current_executable_path() -> Result<String, String> {
    env::current_exe()
        .map(|path| os_str_to_string(path.as_os_str()))
        .map_err(|error| format!("无法读取当前程序路径：{error}"))
}

fn windows_context_menu_roots() -> [&'static str; 2] {
    [
        "HKCU\\Software\\Classes\\Directory\\shell\\GVMT",
        "HKCU\\Software\\Classes\\Directory\\Background\\shell\\GVMT",
    ]
}

fn windows_context_menu_installed() -> bool {
    windows_context_menu_roots()
        .into_iter()
        .all(|root| run_command(["reg", "query", root]).is_ok())
}

fn install_context_menu_root(
    root: &str,
    executable_path: &str,
    path_token: &str,
) -> Result<(), String> {
    set_registry_value(root, "MUIVerb", "GVMT")?;
    set_registry_value(root, "Icon", executable_path)?;
    set_registry_value(root, "SubCommands", "")?;

    for (key, label, action) in [
        ("open", "用 GVMT 打开", "--gvmt-open"),
        ("detect", "检测仓库", "--gvmt-detect"),
        ("update", "更新仓库", "--gvmt-update"),
        ("commit", "提交变更", "--gvmt-commit"),
    ] {
        let item_key = format!("{root}\\shell\\{key}");
        set_registry_default_value(&item_key, label)?;
        set_registry_value(&item_key, "Icon", executable_path)?;
        let command_key = format!("{item_key}\\command");
        set_registry_default_value(
            &command_key,
            &format!("\"{executable_path}\" {action} \"{path_token}\""),
        )?;
    }

    Ok(())
}

fn set_registry_default_value(key: &str, value: &str) -> Result<(), String> {
    run_command_args(
        "reg",
        &[
            "add".into(),
            key.into(),
            "/ve".into(),
            "/t".into(),
            "REG_SZ".into(),
            "/d".into(),
            value.into(),
            "/f".into(),
        ],
    )
    .map(|_| ())
}

fn set_registry_value(key: &str, name: &str, value: &str) -> Result<(), String> {
    run_command_args(
        "reg",
        &[
            "add".into(),
            key.into(),
            "/v".into(),
            name.into(),
            "/t".into(),
            "REG_SZ".into(),
            "/d".into(),
            value.into(),
            "/f".into(),
        ],
    )
    .map(|_| ())
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
        new_command("rundll32")
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
    let output = new_command(&resolved_program)
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
    let output = new_command(&resolved_program)
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
    if !cfg!(windows) {
        return program.to_string();
    }

    match program {
        "npm" => "npm.cmd".to_string(),
        "svn" => svn_executable_candidates()
            .into_iter()
            .find(|candidate| Path::new(candidate).exists())
            .unwrap_or_else(|| program.to_string()),
        _ => program.to_string(),
    }
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
    let output = new_command("reg")
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BranchInfo {
    name: String,
    is_current: bool,
}

#[tauri::command]
fn list_branches(app: AppHandle, id: i64) -> Result<Vec<BranchInfo>, String> {
    let connection = open_database(&app)?;
    let repository =
        find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;

    match repository.vcs_type.as_str() {
        "git" => {
            let output = run_command(["git", "-C", &repository.path, "branch"])?;
            Ok(output
                .lines()
                .map(|line| {
                    let trimmed = line.trim();
                    BranchInfo {
                        is_current: trimmed.starts_with('*'),
                        name: trimmed.trim_start_matches("* ").to_string(),
                    }
                })
                .collect())
        }
        "svn" => {
            let output = run_command([
                "svn",
                "info",
                "--show-item",
                "relative-url",
                &repository.path,
            ])?;
            let base_url = output.trim().to_string();
            // List standard SVN layout branches
            let mut branches = vec![BranchInfo {
                name: format!("trunk ({base_url})"),
                is_current: !base_url.contains("branches"),
            }];
            if let Ok(list) = run_command([
                "svn",
                "ls",
                &format!("{}/../branches", base_url.trim_end_matches("/trunk")),
            ]) {
                for line in list.lines() {
                    let name = line.trim().trim_end_matches('/');
                    if !name.is_empty() {
                        branches.push(BranchInfo {
                            is_current: base_url.contains(&format!("branches/{name}")),
                            name: name.to_string(),
                        });
                    }
                }
            }
            Ok(branches)
        }
        _ => Err("当前仓库类型不支持分支操作".to_string()),
    }
}

#[tauri::command]
fn switch_branch(app: AppHandle, id: i64, branch: String) -> Result<OperationResult, String> {
    let connection = open_database(&app)?;
    let repository =
        find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;

    match repository.vcs_type.as_str() {
        "git" => {
            let output = run_command(["git", "-C", &repository.path, "checkout", &branch])?;
            Ok(OperationResult {
                operation: "checkout".to_string(),
                vcs_type: "git".to_string(),
                success: true,
                summary: format!("已切换到分支 {branch}"),
                output,
                warning: None,
                missing_svn_cli: false,
            })
        }
        "svn" => {
            let output = run_command(["svn", "switch", &branch, &repository.path])?;
            Ok(OperationResult {
                operation: "switch".to_string(),
                vcs_type: "svn".to_string(),
                success: true,
                summary: format!("已切换到 {branch}"),
                output,
                warning: None,
                missing_svn_cli: false,
            })
        }
        _ => Err("当前仓库类型不支持分支操作".to_string()),
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            add_ignore_rule,
            add_repository,
            commit_repository,
            consume_startup_context,
            delete_repository,
            detect_repository,
            get_windows_context_menu_status,
            get_ignore_rules,
            get_repository_diff,
            get_repository_status,
            install_windows_context_menu,
            list_branches,
            list_quality_checks,
            list_repository_files,
            list_repositories,
            open_svn_cli_download_page,
            read_repository_file,
            refresh_repository,
            run_quality_check,
            switch_branch,
            uninstall_windows_context_menu,
            update_gitignore,
            update_repository,
            update_svn_ignore
        ])
        .run(tauri::generate_context!())
        .expect("error while running GVMT");
}
