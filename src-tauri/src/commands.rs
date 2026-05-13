use serde::Serialize;
use crate::command_exec::run_command_args;
use crate::utils::{summarize_changes};
use crate::{
    db, file_browser, git, ignore, quality, svn, windows,
};
use crate::models::{
    AddIgnoreRuleRequest, AddRepositoryInput, BranchInfo, RemoveIgnoreRuleRequest,
    CommitRequest, DetectedRepository, DiffRequest, IgnoreRules,
    OperationResult as OpResult, QualityCheckResult, QualityCheckTemplate, QualityCheckType,
    Repository, RepositoryDiff, RepositoryDirectory, RepositoryFilePreview, RepositoryStatus,
    StartupContext, UpdateGitignoreRequest, WindowsContextMenuStatus,
};
use tauri::AppHandle;

async fn run_blocking<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| format!("后台线程执行失败: {error}"))?
}

// ── Repository CRUD ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_repositories(app: AppHandle) -> Result<Vec<Repository>, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
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
    })
    .await
}

#[tauri::command]
pub async fn add_repository(app: AppHandle, input: AddRepositoryInput) -> Result<Repository, String> {
    run_blocking(move || {
        let detected = detect_repository_sync(input.path)?;
        let name = input.name.unwrap_or(detected.name);
        let connection = db::open_database(&app)?;

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
                rusqlite::params![
                    name,
                    detected.path,
                    detected.vcs_type,
                    detected.remote_url,
                    detected.branch_or_revision
                ],
            )
            .map_err(|error| error.to_string())?;

        db::find_repository_by_path(&connection, &detected.path)?
            .ok_or_else(|| "仓库保存后未能读取记录".to_string())
    })
    .await
}

#[tauri::command]
pub async fn delete_repository(app: AppHandle, id: i64) -> Result<(), String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let deleted = connection
            .execute("DELETE FROM repositories WHERE id = ?1", rusqlite::params![id])
            .map_err(|error| error.to_string())?;

        if deleted == 0 {
            return Err("未找到需要删除的仓库记录".to_string());
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn refresh_repository(app: AppHandle, id: i64) -> Result<Repository, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository = db::find_repository_by_id(&connection, id)?
            .ok_or_else(|| "未找到需要重新检测的仓库".to_string())?;
        let detected = detect_repository_sync(repository.path)?;

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
                rusqlite::params![
                    detected.name,
                    detected.path,
                    detected.vcs_type,
                    detected.remote_url,
                    detected.branch_or_revision,
                    id
                ],
            )
            .map_err(|error| error.to_string())?;

        db::find_repository_by_id(&connection, id)?
            .ok_or_else(|| "仓库重新检测后未能读取记录".to_string())
    })
    .await
}

// ── Detection ─────────────────────────────────────────────────────────────

/// Synchronous implementation used by async commands and batch operations
fn detect_repository_sync(path: String) -> Result<DetectedRepository, String> {
    let repository_path = db::normalize_existing_path(path)?;
    let repository_path_string = db::path_to_display_string(&repository_path)?;
    let name = repository_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("repository")
        .to_string();

    let git_root = crate::command_exec::run_command([
        "git",
        "-C",
        &repository_path_string,
        "rev-parse",
        "--show-toplevel",
    ]);
    let svn_metadata = svn::detect_svn_metadata(&repository_path_string, &repository_path);

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
        "git" | "mixed" => crate::command_exec::run_command([
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
        "git" | "mixed" => crate::command_exec::run_command([
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

#[tauri::command]
pub async fn detect_repository(path: String) -> Result<DetectedRepository, String> {
    run_blocking(move || detect_repository_sync(path)).await
}

// ── Batch Operations ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn refresh_all_repositories(app: AppHandle) -> Result<Vec<Repository>, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let mut stmt = connection
            .prepare("SELECT id, path FROM repositories ORDER BY updated_at DESC")
            .map_err(|error| error.to_string())?;

        let repos: Vec<(i64, String)> = stmt
            .query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;

        let mut results = Vec::new();
        for (id, path) in repos {
            match detect_repository_sync(path) {
                Ok(detected) => {
                    let _ = connection.execute(
                        "UPDATE repositories SET name = ?1, vcs_type = ?2, remote_url = ?3, branch_or_revision = ?4, updated_at = CURRENT_TIMESTAMP WHERE id = ?5",
                        rusqlite::params![detected.name, detected.vcs_type, detected.remote_url, detected.branch_or_revision, id],
                    );
                    if let Ok(Some(repo)) = db::find_repository_by_id(&connection, id) {
                        results.push(repo);
                    }
                }
                Err(_) => {}
            }
        }
        Ok(results)
    })
    .await
}

#[tauri::command]
pub async fn update_all_repositories(app: AppHandle) -> Result<Vec<OpResult>, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let mut stmt = connection
            .prepare("SELECT id, path, vcs_type FROM repositories ORDER BY updated_at DESC")
            .map_err(|error| error.to_string())?;

        let repos: Vec<(i64, String, String)> = stmt
            .query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
            })
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;

        let mut all_results = Vec::new();
        for (_id, path, vcs_type) in repos {
            match vcs_type.as_str() {
                "git" => all_results.push(git::git_update_result(&path)),
                "svn" => all_results.push(svn::svn_update_result(&path, None)),
                "mixed" => {
                    all_results.push(git::git_update_result(&path));
                    all_results.push(svn::svn_update_result(&path, None));
                }
                _ => {}
            }
        }
        Ok(all_results)
    })
    .await
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteUpdateStatus {
    pub has_updates: bool,
    pub details: Option<String>,
}

#[tauri::command]
pub async fn check_remote_updates(app: AppHandle, id: i64) -> Result<RemoteUpdateStatus, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository = db::find_repository_by_id(&connection, id)?
            .ok_or_else(|| "未找到仓库".to_string())?;

        match repository.vcs_type.as_str() {
            "git" => {
                let has_updates = git::git_has_remote_updates(&repository.path)?;
                Ok(RemoteUpdateStatus {
                    has_updates,
                    details: if has_updates {
                        Some("远端有新的提交".to_string())
                    } else {
                        None
                    },
                })
            }
            "svn" => {
                let has_updates = svn::svn_has_remote_updates(&repository.path)?;
                Ok(RemoteUpdateStatus {
                    has_updates,
                    details: if has_updates {
                        Some("服务器端有新的提交".to_string())
                    } else {
                        None
                    },
                })
            }
            "mixed" => {
                let git_updates = git::git_has_remote_updates(&repository.path)?;
                let svn_updates = svn::svn_has_remote_updates(&repository.path)?;
                let has_updates = git_updates || svn_updates;
                Ok(RemoteUpdateStatus {
                    has_updates,
                    details: if has_updates {
                        let mut parts = Vec::new();
                        if git_updates { parts.push("Git"); }
                        if svn_updates { parts.push("SVN"); }
                        Some(format!("{} 远端有新的提交", parts.join(" / ")))
                    } else {
                        None
                    },
                })
            }
            _ => Ok(RemoteUpdateStatus {
                has_updates: false,
                details: None,
            }),
        }
    })
    .await
}

// ── Status ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_repository_status(app: AppHandle, id: i64) -> Result<RepositoryStatus, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository = db::find_repository_by_id(&connection, id)?
            .ok_or_else(|| "未找到需要检测状态的仓库".to_string())?;

        let mut warning = None;
        let mut missing_svn_cli = false;
        let mut changes = Vec::new();

        match repository.vcs_type.as_str() {
            "git" => changes.extend(git::git_status_changes(&repository.path)?),
            "svn" => match svn::svn_status_changes(&repository.path) {
                Ok(items) => changes.extend(items),
                Err(error) => {
                    missing_svn_cli = svn::is_missing_svn_cli_error(&error);
                    warning = Some(svn::svn_status_warning(&error));
                }
            },
            "mixed" => {
                changes.extend(git::git_status_changes(&repository.path)?);
                match svn::svn_status_changes(&repository.path) {
                    Ok(items) => changes.extend(items),
                    Err(error) => {
                        missing_svn_cli = svn::is_missing_svn_cli_error(&error);
                        warning = Some(svn::svn_status_warning(&error));
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
    })
    .await
}

// ── Diff ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_repository_diff(
    app: AppHandle,
    id: i64,
    input: DiffRequest,
) -> Result<RepositoryDiff, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository = db::find_repository_by_id(&connection, id)?
            .ok_or_else(|| "未找到需要查看 diff 的仓库".to_string())?;
        let path = file_browser::normalize_relative_path(&input.path)?;
        if path.is_empty() {
            return Err("请选择一个文件查看 diff".to_string());
        }

        let (content, is_binary, warning) = if input.status == "untracked" {
            file_browser::untracked_file_preview(&repository.path, &path)?
        } else {
            match input.vcs_type.as_str() {
                "git" => (git::git_file_diff(&repository.path, &path)?, false, None),
                "svn" => (svn::svn_file_diff(&repository.path, &path)?, false, None),
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
    })
    .await
}

// ── Commit ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn commit_repository(
    app: AppHandle,
    id: i64,
    input: CommitRequest,
) -> Result<Vec<OpResult>, String> {
    run_blocking(move || {
        let message = input.message.trim();
        if message.is_empty() {
            return Err("请输入提交信息".to_string());
        }
        if input.files.is_empty() {
            return Err("请选择需要提交的文件".to_string());
        }

        let connection = db::open_database(&app)?;
        let repository = db::find_repository_by_id(&connection, id)?
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
            results.extend(git::git_commit_results(
                &repository.path,
                message,
                input.push,
                &git_files,
            ));
        }
        if !svn_files.is_empty() {
            results.push(svn::svn_commit_result(&repository.path, message, &svn_files));
        }

        if results.is_empty() {
            return Err("当前选择的文件没有可提交的 Git / SVN 变更".to_string());
        }

        Ok(results)
    })
    .await
}

// ── Update ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn update_repository(app: AppHandle, id: i64, depth: Option<String>) -> Result<Vec<OpResult>, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository = db::find_repository_by_id(&connection, id)?
            .ok_or_else(|| "未找到需要更新的仓库".to_string())?;

        let app_ref = app.clone();
        let results = match repository.vcs_type.as_str() {
            "git" => vec![git::git_update_result(&repository.path)],
            "svn" => vec![svn::svn_update_streaming(&app_ref, &repository.path, depth.as_deref())],
            "mixed" => vec![
                git::git_update_result(&repository.path),
                svn::svn_update_streaming(&app_ref, &repository.path, depth.as_deref()),
            ],
            _ => vec![OpResult {
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
    })
    .await
}

// ── Startup Context ───────────────────────────────────────────────────────

#[tauri::command]
pub fn consume_startup_context() -> Result<Option<StartupContext>, String> {
    let mutex = crate::startup::get_startup_context_mutex();
    let mut context = mutex.lock().map_err(|error| error.to_string())?;
    Ok(context.take())
}

// ── Windows Context Menu ──────────────────────────────────────────────────

#[tauri::command]
pub async fn get_windows_context_menu_status() -> Result<WindowsContextMenuStatus, String> {
    run_blocking(windows::get_windows_context_menu_status_impl).await
}

#[tauri::command]
pub async fn install_windows_context_menu() -> Result<WindowsContextMenuStatus, String> {
    run_blocking(windows::install_windows_context_menu_impl).await
}

#[tauri::command]
pub async fn uninstall_windows_context_menu() -> Result<WindowsContextMenuStatus, String> {
    run_blocking(windows::uninstall_windows_context_menu_impl).await
}

#[tauri::command]
pub async fn retry_push(app: AppHandle, id: i64) -> Result<OpResult, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository =
            db::find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;
        Ok(git::git_push_only(&repository.path))
    })
    .await
}

// ── Stage / Unstage ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn stage_all_files(app: AppHandle, id: i64) -> Result<OpResult, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository =
            db::find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;

        match repository.vcs_type.as_str() {
            "git" | "mixed" => {
                match run_command_args("git", &["-C".into(), repository.path.clone(), "add".into(), "-A".into()]) {
                    Ok(output) => Ok(OpResult {
                        operation: "stage".to_string(),
                        vcs_type: "git".to_string(),
                        success: true,
                        summary: "Git 暂存全部完成".to_string(),
                        output,
                        warning: None,
                        missing_svn_cli: false,
                    }),
                    Err(error) => Ok(OpResult {
                        operation: "stage".to_string(),
                        vcs_type: "git".to_string(),
                        success: false,
                        summary: "Git 暂存全部失败".to_string(),
                        output: String::new(),
                        warning: Some(format!("Git add 失败：{error}")),
                        missing_svn_cli: false,
                    }),
                }
            }
            "svn" => Ok(OpResult {
                operation: "stage".to_string(),
                vcs_type: "svn".to_string(),
                success: true,
                summary: "SVN 无需暂存操作，提交时会自动包含所有变更".to_string(),
                output: String::new(),
                warning: None,
                missing_svn_cli: false,
            }),
            _ => Err("无法识别的版本控制类型".to_string()),
        }
    })
    .await
}

#[tauri::command]
pub async fn unstage_all_files(app: AppHandle, id: i64) -> Result<OpResult, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository =
            db::find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;

        match repository.vcs_type.as_str() {
            "git" | "mixed" => {
                match run_command_args("git", &["-C".into(), repository.path.clone(), "reset".into(), "HEAD".into()]) {
                    Ok(output) => Ok(OpResult {
                        operation: "unstage".to_string(),
                        vcs_type: "git".to_string(),
                        success: true,
                        summary: "Git 取消暂存完成".to_string(),
                        output,
                        warning: None,
                        missing_svn_cli: false,
                    }),
                    Err(error) => Ok(OpResult {
                        operation: "unstage".to_string(),
                        vcs_type: "git".to_string(),
                        success: false,
                        summary: "Git 取消暂存失败".to_string(),
                        output: String::new(),
                        warning: Some(format!("Git reset 失败：{error}")),
                        missing_svn_cli: false,
                    }),
                }
            }
            "svn" => Ok(OpResult {
                operation: "unstage".to_string(),
                vcs_type: "svn".to_string(),
                success: true,
                summary: "SVN 不支持取消暂存，请使用 revert 撤销变更".to_string(),
                output: String::new(),
                warning: None,
                missing_svn_cli: false,
            }),
            _ => Err("无法识别的版本控制类型".to_string()),
        }
    })
    .await
}

#[tauri::command]
pub async fn unstage_file(app: AppHandle, id: i64, path: String) -> Result<OpResult, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository =
            db::find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;
        let normalized = file_browser::normalize_relative_path(&path)?;
        Ok(git::git_reset_file(&repository.path, &normalized))
    })
    .await
}

// ── Git Stash ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_stash_push(app: AppHandle, id: i64, message: Option<String>) -> Result<OpResult, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository =
            db::find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;
        Ok(git::git_stash_push(&repository.path, message.as_deref()))
    })
    .await
}

#[tauri::command]
pub async fn git_stash_pop(app: AppHandle, id: i64) -> Result<OpResult, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository =
            db::find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;
        Ok(git::git_stash_pop(&repository.path))
    })
    .await
}

#[tauri::command]
pub async fn git_stash_list(app: AppHandle, id: i64) -> Result<Vec<git::GitStashEntry>, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository =
            db::find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;
        git::git_stash_list(&repository.path)
    })
    .await
}

#[tauri::command]
pub async fn git_stash_drop(app: AppHandle, id: i64, index: usize) -> Result<OpResult, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository =
            db::find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;
        Ok(git::git_stash_drop(&repository.path, index))
    })
    .await
}

// ── Git Log ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_log(app: AppHandle, id: i64, max_count: Option<usize>) -> Result<Vec<git::GitCommitLog>, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository =
            db::find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;
        git::git_log(&repository.path, max_count.unwrap_or(20))
    })
    .await
}

// ── Git Fetch ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_fetch(app: AppHandle, id: i64) -> Result<OpResult, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository =
            db::find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;
        Ok(git::git_fetch(&repository.path))
    })
    .await
}

// ── Git Reset ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_reset(app: AppHandle, id: i64, mode: String, target: String) -> Result<OpResult, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository =
            db::find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;
        Ok(git::git_reset(&repository.path, &mode, &target))
    })
    .await
}

// ── Quality Checks ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_quality_checks(app: AppHandle, id: i64) -> Result<Vec<QualityCheckTemplate>, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        quality::list_quality_checks_impl(&connection, id)
    })
    .await
}

#[tauri::command]
pub async fn run_quality_check(
    app: AppHandle,
    id: i64,
    check_type: QualityCheckType,
) -> Result<QualityCheckResult, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        quality::run_quality_check_impl(&connection, id, check_type)
    })
    .await
}

// ── File Browser ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_repository_files(
    app: AppHandle,
    id: i64,
    relative_path: Option<String>,
) -> Result<RepositoryDirectory, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository = db::find_repository_by_id(&connection, id)?
            .ok_or_else(|| "未找到需要浏览的仓库".to_string())?;
        let root = std::path::PathBuf::from(&repository.path);
        let directory_path = file_browser::safe_repository_child_path(&root, relative_path.as_deref())?;

        if !directory_path.is_dir() {
            return Err("当前路径不是目录".to_string());
        }

        let current_path = relative_path
            .as_deref()
            .map(file_browser::normalize_relative_path)
            .transpose()?
            .unwrap_or_default();
        let parent_path = file_browser::parent_relative_path(&current_path);
        let entries = file_browser::repository_file_entries(&directory_path, &current_path)?;

        Ok(RepositoryDirectory {
            repository_id: repository.id,
            path: current_path,
            parent_path,
            entries,
        })
    })
    .await
}

#[tauri::command]
pub async fn read_repository_file(
    app: AppHandle,
    id: i64,
    relative_path: String,
) -> Result<RepositoryFilePreview, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository = db::find_repository_by_id(&connection, id)?
            .ok_or_else(|| "未找到需要预览的仓库".to_string())?;
        let normalized_path = file_browser::normalize_relative_path(&relative_path)?;
        if normalized_path.is_empty() {
            return Err("请选择一个文件进行预览".to_string());
        }

        let root = std::path::PathBuf::from(&repository.path);
        let file_path = file_browser::safe_repository_child_path(&root, Some(&normalized_path))?;
        if !file_path.is_file() {
            return Err("当前路径不是可预览的文件".to_string());
        }

        file_browser::repository_file_preview(repository.id, &file_path, &normalized_path)
    })
    .await
}

// ── Ignore Rules ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_ignore_rules(app: AppHandle, id: i64) -> Result<IgnoreRules, String> {
    run_blocking(move || {
        use std::fs;

        let connection = db::open_database(&app)?;
        let repository =
            db::find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;

        let mut gitignore_path = None;
        let mut gitignore_content = None;
        let mut svnignore_content = None;
        let svn_entries = Vec::new();

        if repository.vcs_type == "git" || repository.vcs_type == "mixed" {
            let gitignore = std::path::Path::new(&repository.path).join(".gitignore");
            gitignore_path = Some(String::from(".gitignore"));
            if gitignore.exists() {
                gitignore_content = Some(fs::read_to_string(&gitignore).unwrap_or_default());
            }
        }

        if repository.vcs_type == "svn" || repository.vcs_type == "mixed" {
            let svnignore = std::path::Path::new(&repository.path).join(".svnignore");
            if svnignore.exists() {
                svnignore_content = Some(fs::read_to_string(&svnignore).unwrap_or_default());
            } else {
                svnignore_content = Some(String::new());
            }
        }

        let skip_worktree_files = if repository.vcs_type == "git" || repository.vcs_type == "mixed" {
            git::git_list_skip_worktree(&repository.path)
        } else {
            Vec::new()
        };

        Ok(IgnoreRules {
            vcs_type: repository.vcs_type,
            gitignore_path,
            gitignore_content,
            svnignore_content,
            svn_entries,
            skip_worktree_files,
        })
    })
    .await
}

#[tauri::command]
pub async fn add_ignore_rule(
    app: AppHandle,
    id: i64,
    input: AddIgnoreRuleRequest,
) -> Result<OpResult, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository =
            db::find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;
        let normalized_path = file_browser::normalize_relative_path(&input.path)?;

        match input.vcs_type.as_str() {
            "git" => {
                if git::git_is_tracked(&repository.path, &normalized_path) {
                    git::git_set_skip_worktree(&repository.path, &normalized_path)
                        .map(|_| OpResult {
                            operation: "ignore".to_string(),
                            vcs_type: "git".to_string(),
                            success: true,
                            summary: format!("已通过 skip-worktree 隐藏：{normalized_path}"),
                            output: String::new(),
                            warning: None,
                            missing_svn_cli: false,
                        })
                } else {
                    ignore::gitignore_append_rule(&repository.path, &normalized_path)
                }
            }
            "svn" => ignore::svn_ignore_append_rule(&repository.path, &normalized_path),
            _ => Err("无法识别的版本控制类型".to_string()),
        }
    })
    .await
}

#[tauri::command]
pub async fn remove_ignore_rule(
    app: AppHandle,
    id: i64,
    input: RemoveIgnoreRuleRequest,
) -> Result<OpResult, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository =
            db::find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;
        let normalized_path = file_browser::normalize_relative_path(&input.path)?;

        match input.vcs_type.as_str() {
            "git" => {
                if git::git_is_tracked(&repository.path, &normalized_path) {
                    git::git_unset_skip_worktree(&repository.path, &normalized_path)
                        .map(|_| OpResult {
                            operation: "ignore".to_string(),
                            vcs_type: "git".to_string(),
                            success: true,
                            summary: format!("已恢复文件跟踪：{normalized_path}"),
                            output: String::new(),
                            warning: None,
                            missing_svn_cli: false,
                        })
                } else {
                    ignore::gitignore_remove_rule(&repository.path, &normalized_path)
                }
            }
            "svn" => ignore::svnignore_remove_rule(&repository.path, &normalized_path),
            _ => Err("无法识别的版本控制类型".to_string()),
        }
    })
    .await
}

#[tauri::command]
pub async fn update_gitignore(
    app: AppHandle,
    id: i64,
    input: UpdateGitignoreRequest,
) -> Result<OpResult, String> {
    run_blocking(move || {
        use std::fs;

        let connection = db::open_database(&app)?;
        let repository =
            db::find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;

        let gitignore = std::path::Path::new(&repository.path).join(".gitignore");
        fs::write(&gitignore, input.content.as_bytes()).map_err(|error| error.to_string())?;

        Ok(OpResult {
            operation: "ignore".to_string(),
            vcs_type: "git".to_string(),
            success: true,
            summary: "已更新 .gitignore".to_string(),
            output: String::new(),
            warning: None,
            missing_svn_cli: false,
        })
    })
    .await
}

#[tauri::command]
pub async fn update_svn_ignore(
    app: AppHandle,
    id: i64,
    content: String,
) -> Result<OpResult, String> {
    run_blocking(move || {
        use std::fs;

        let connection = db::open_database(&app)?;
        let repository =
            db::find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;

        let svnignore = std::path::Path::new(&repository.path).join(".svnignore");
        fs::write(&svnignore, content.as_bytes()).map_err(|error| error.to_string())?;

        Ok(OpResult {
            operation: "ignore".to_string(),
            vcs_type: "svn".to_string(),
            success: true,
            summary: "已更新 .svnignore".to_string(),
            output: String::new(),
            warning: None,
            missing_svn_cli: false,
        })
    })
    .await
}

// ── Open SVN download page ────────────────────────────────────────────────

#[tauri::command]
pub fn open_svn_cli_download_page(target: String) -> Result<(), String> {
    let url = match target.as_str() {
        "sliksvn" => "https://sliksvn.com/download/",
        _ => "https://tortoisesvn.net/downloads.html",
    };

    open_url(url)
}

fn open_url(url: &str) -> Result<(), String> {
    if cfg!(windows) {
        crate::command_exec::new_command("rundll32")
            .args(["url.dll,FileProtocolHandler", url])
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    } else {
        Err("当前版本仅支持 Windows 打开下载页面".to_string())
    }
}

// ── SVN Revert / Cleanup / Resolve / Log ──────────────────────────────────

#[tauri::command]
pub async fn svn_revert(app: AppHandle, id: i64, path: String) -> Result<OpResult, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository =
            db::find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;
        Ok(svn::svn_revert(&repository.path, &path))
    })
    .await
}

#[tauri::command]
pub async fn svn_cleanup(app: AppHandle, id: i64) -> Result<OpResult, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository =
            db::find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;
        Ok(svn::svn_cleanup(&repository.path))
    })
    .await
}

#[tauri::command]
pub async fn svn_resolve(app: AppHandle, id: i64, path: String) -> Result<OpResult, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository =
            db::find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;
        Ok(svn::svn_resolve(&repository.path, &path))
    })
    .await
}

#[tauri::command]
pub async fn svn_log_command(app: AppHandle, id: i64, max_count: Option<usize>) -> Result<Vec<crate::svn::SvnCommitLog>, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository =
            db::find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;
        svn::svn_log(&repository.path, max_count.unwrap_or(20))
    })
    .await
}

// ── Branches ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_branches(app: AppHandle, id: i64) -> Result<Vec<BranchInfo>, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository =
            db::find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;

        match repository.vcs_type.as_str() {
            "git" => {
                let output =
                    crate::command_exec::run_command(["git", "-C", &repository.path, "branch"])?;
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
                let output = crate::command_exec::run_command([
                    "svn",
                    "info",
                    "--show-item",
                    "relative-url",
                    &repository.path,
                ])?;
                let base_url = output.trim().to_string();
                let mut branches = vec![BranchInfo {
                    name: format!("trunk ({base_url})"),
                    is_current: !base_url.contains("branches"),
                }];
                if let Ok(list) = crate::command_exec::run_command([
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
    })
    .await
}

#[tauri::command]
pub async fn switch_branch(
    app: AppHandle,
    id: i64,
    branch: String,
) -> Result<OpResult, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        let repository =
            db::find_repository_by_id(&connection, id)?.ok_or_else(|| "未找到仓库".to_string())?;

        match repository.vcs_type.as_str() {
            "git" => {
                let output = crate::command_exec::run_command([
                    "git",
                    "-C",
                    &repository.path,
                    "checkout",
                    &branch,
                ])?;
                Ok(OpResult {
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
                let output = crate::command_exec::run_command([
                    "svn",
                    "switch",
                    &branch,
                    &repository.path,
                ])?;
                Ok(OpResult {
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
    })
    .await
}

// ── Operation Logs ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn log_operation(
    app: tauri::AppHandle,
    repository_id: Option<i64>,
    operation: String,
    vcs_type: String,
    success: bool,
    summary: String,
    output: String,
    warning: Option<String>,
) -> Result<i64, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        db::insert_operation_log(
            &connection,
            repository_id,
            &operation,
            &vcs_type,
            success,
            &summary,
            &output,
            warning.as_deref(),
        )
    })
    .await
}

#[tauri::command]
pub async fn list_operation_logs(
    app: tauri::AppHandle,
    repository_id: Option<i64>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<crate::models::OperationLog>, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        db::list_operation_logs(&connection, repository_id, limit.unwrap_or(50), offset.unwrap_or(0))
    })
    .await
}

#[tauri::command]
pub async fn clear_operation_logs(
    app: tauri::AppHandle,
    before_days: Option<i64>,
) -> Result<usize, String> {
    run_blocking(move || {
        let connection = db::open_database(&app)?;
        db::clear_old_operation_logs(&connection, before_days.unwrap_or(30))
    })
    .await
}

// ── GitHub / gh Integration ─────────────────────────────────────────────

#[tauri::command]
pub async fn check_gh_status() -> Result<crate::gh::GhStatus, String> {
    run_blocking(|| Ok(crate::gh::check_gh_status())).await
}

#[tauri::command]
pub async fn get_gh_repo_info(remote_url: String) -> Result<crate::gh::GhRepoInfo, String> {
    run_blocking(move || crate::gh::get_gh_repo_info(&remote_url)).await
}

#[tauri::command]
pub async fn gh_list_directory(
    remote_url: String,
    path: String,
    reference: Option<String>,
) -> Result<crate::gh::GitHubDirectory, String> {
    run_blocking(move || crate::gh::gh_list_directory(&remote_url, &path, reference.as_deref())).await
}

#[tauri::command]
pub async fn gh_read_file(
    remote_url: String,
    path: String,
    reference: Option<String>,
) -> Result<crate::gh::GitHubFileContent, String> {
    run_blocking(move || crate::gh::gh_read_file(&remote_url, &path, reference.as_deref())).await
}

#[tauri::command]
pub async fn gh_list_prs(
    remote_url: String,
    state: Option<String>,
) -> Result<crate::gh::GitHubPrList, String> {
    run_blocking(move || crate::gh::gh_list_prs(&remote_url, state.as_deref())).await
}

#[tauri::command]
pub async fn gh_list_actions(remote_url: String) -> Result<crate::gh::GitHubRunList, String> {
    run_blocking(move || crate::gh::gh_list_actions(&remote_url)).await
}

#[tauri::command]
pub async fn gh_open_browser(remote_url: String, page: String) -> Result<(), String> {
    run_blocking(move || crate::gh::gh_open_browser(&remote_url, &page)).await
}

#[tauri::command]
pub fn parse_remote_owner_repo(remote_url: String) -> Result<Option<crate::gh::GhOwnerRepo>, String> {
    Ok(crate::gh::parse_owner_repo_from_remote(&remote_url).map(|(owner, name)| crate::gh::GhOwnerRepo { owner, name }))
}

#[tauri::command]
pub async fn gh_create_pr(
    remote_url: String,
    input: crate::gh::GhCreatePrInput,
) -> Result<crate::gh::GitHubPr, String> {
    run_blocking(move || crate::gh::gh_create_pr(&remote_url, &input)).await
}

// ── Folder Picker ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn pick_folder() -> Result<Option<String>, String> {
    run_blocking(|| {
        #[cfg(target_os = "windows")]
        {
            let output = crate::command_exec::run_command([
                "powershell",
                "-NoProfile",
                "-Command",
                "Add-Type -AssemblyName System.Windows.Forms; \
                 $f = New-Object System.Windows.Forms.FolderBrowserDialog -Property @{ \
                   Description = '选择一个仓库目录'; \
                   ShowNewFolderButton = $true \
                 }; \
                 if ($f.ShowDialog() -eq 'OK') { $f.SelectedPath } else { '' }",
            ])?;
            let trimmed = output.trim().to_string();
            Ok(if trimmed.is_empty() { None } else { Some(trimmed) })
        }
        #[cfg(not(target_os = "windows"))]
        {
            Ok(None)
        }
    })
    .await
}

// ── SVN Remote File Browsing ──────────────────────────────────────────────

#[tauri::command]
pub async fn svn_remote_list(url: String) -> Result<crate::svn::SvnRemoteDirectory, String> {
    run_blocking(move || crate::svn::svn_remote_list(&url)).await
}

#[tauri::command]
pub async fn svn_remote_cat(url: String) -> Result<String, String> {
    run_blocking(move || crate::svn::svn_remote_cat(&url)).await
}
