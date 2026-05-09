use crate::command_exec::run_command;
use crate::db::{database_path_fallback, normalize_existing_path, path_to_display_string};
use crate::models::{DetectedRepository, OperationResult, StartupContext};
use crate::svn;
use rusqlite::{params, Connection, OptionalExtension};
use std::{env, fs};
use std::sync::{Mutex, OnceLock};

static STARTUP_CONTEXT: OnceLock<Mutex<Option<StartupContext>>> = OnceLock::new();

pub fn get_startup_context_mutex() -> &'static Mutex<Option<StartupContext>> {
    STARTUP_CONTEXT.get_or_init(|| Mutex::new(parse_startup_context()))
}

pub fn parse_startup_context() -> Option<StartupContext> {
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

/// Entry point for CLI mode (--gvmt-status, --gvmt-detect --json, --help, --version).
/// Writes output to stdout/stderr and exits with appropriate code.
pub fn execute_cli_command() {
    let mut args = env::args().skip(1);

    // Check for --help / --version first
    if let Some(arg) = args.next() {
        match arg.as_str() {
            "--help" | "-h" => {
                println!("GVMT — 通用版本控制工具");
                println!("");
                println!("用法:");
                println!("  gvmt                         启动图形界面");
                println!("  gvmt --help                  显示此帮助信息");
                println!("  gvmt --version               显示版本信息");
                println!("");
                println!("CLI 命令:");
                println!("  gvmt --gvmt-detect <路径>    检测仓库类型");
                println!("  gvmt --gvmt-status <路径>    显示仓库状态");
                println!("  gvmt --gvmt-update <路径>    更新仓库 (git pull / svn update)");
                println!("");
                println!("选项:");
                println!("  --json                       以 JSON 格式输出 (与 --gvmt-detect/--gvmt-status 搭配使用)");
                println!("");
                println!("GUI 命令 (启动图形界面):");
                println!("  gvmt --gvmt-open <路径>      用 GVMT 打开仓库");
                println!("  gvmt --gvmt-commit <路径>    提交变更");
                std::process::exit(0);
            }
            "--version" | "-v" => {
                println!("GVMT version {}", env!("CARGO_PKG_VERSION"));
                std::process::exit(0);
            }
            "--json" => {
                // --json flag before command
                let cmd = args.next();
                exec_cli_json(cmd.as_deref(), args.next());
                std::process::exit(1);
            }
            "--gvmt-detect" => {
                let use_json = args.any(|a| a == "--json");
                let path = std::env::args().skip(1)
                    .find(|a| !a.starts_with("--"))
                    .or_else(|| std::env::args().nth(2));
                exec_cli_detect(path, use_json);
            }
            "--gvmt-status" => {
                let use_json = args.any(|a| a == "--json");
                let path = std::env::args().skip(1)
                    .find(|a| !a.starts_with("--"))
                    .or_else(|| std::env::args().nth(2));
                exec_cli_status(path, use_json);
            }
            "--gvmt-update" => {
                let path = std::env::args().nth(2);
                exec_cli_update(path);
            }
            _ => {
                eprintln!("未知参数: {}", arg);
                eprintln!("使用 --help 查看帮助");
                std::process::exit(1);
            }
        }
    } else {
        eprintln!("请在 CLI 模式下指定命令，使用 --help 查看帮助");
        std::process::exit(1);
    }
}

fn exec_cli_detect(path: Option<String>, use_json: bool) {
    let path = match path {
        Some(p) => p,
        None => {
            eprintln!("错误: 请指定路径");
            std::process::exit(1);
        }
    };

    match detect_repository_impl(path) {
        Ok(detected) => {
            if use_json {
                println!(
                    "{}",
                    serde_json::to_string(&detected).unwrap_or_default()
                );
            } else {
                println!("路径: {}", detected.path);
                println!("名称: {}", detected.name);
                println!("类型: {}", detected.vcs_type);
                if let Some(url) = detected.remote_url {
                    println!("远端: {url}");
                }
                if let Some(branch) = detected.branch_or_revision {
                    println!("分支: {branch}");
                }
            }
            std::process::exit(0);
        }
        Err(error) => {
            eprintln!("错误: {error}");
            std::process::exit(1);
        }
    }
}

fn exec_cli_status(path: Option<String>, use_json: bool) {
    let path = match path {
        Some(p) => p,
        None => {
            eprintln!("错误: 请指定路径");
            std::process::exit(1);
        }
    };

    let repo_path = match normalize_existing_path(path.clone()) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("错误: {e}");
            std::process::exit(1);
        }
    };
    let repo_path_str = match path_to_display_string(&repo_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("错误: {e}");
            std::process::exit(1);
        }
    };

    // Try git status first
    if let Ok(output) = run_command(["git", "-C", &repo_path_str, "status", "--porcelain"]) {
        if use_json {
            let changes: Vec<serde_json::Value> = output
                .lines()
                .filter_map(|line| {
                    let line = line.trim();
                    if line.is_empty() {
                        return None;
                    }
                    let status = line.get(..2).unwrap_or("??").trim();
                    let file_path = line.get(3..).unwrap_or("");
                    Some(serde_json::json!({
                        "status": match status {
                            "M" => "modified",
                            "A" => "added",
                            "D" => "deleted",
                            "R" => "renamed",
                            "??" => "untracked",
                            "UU" | "AA" | "DD" => "conflicted",
                            _ => "unknown",
                        },
                        "path": file_path,
                        "vcsType": "git",
                    }))
                })
                .collect();
            println!(
                "{}",
                serde_json::to_string_pretty(&serde_json::json!({
                    "vcsType": "git",
                    "changes": changes,
                    "total": changes.len(),
                }))
                .unwrap_or_default()
            );
        } else {
            let trimmed = output.trim();
            if trimmed.is_empty() {
                println!("工作区干净，无变更");
            } else {
                println!("变更:");
                for line in trimmed.lines() {
                    println!("  {line}");
                }
            }
        }
        std::process::exit(0);
    }

    // Fall back to svn status
    if let Ok(output) = run_command(["svn", "status", &repo_path_str]) {
        if use_json {
            let changes: Vec<serde_json::Value> = output
                .lines()
                .filter_map(|line| {
                    let line = line.trim();
                    if line.is_empty() {
                        return None;
                    }
                    let status = line.chars().next().unwrap_or(' ');
                    let file_path = line.get(8..).unwrap_or("");
                    Some(serde_json::json!({
                        "status": match status {
                            'M' => "modified",
                            'A' => "added",
                            'D' => "deleted",
                            'R' => "renamed",
                            '?' => "untracked",
                            'C' | '!' | '~' => "conflicted",
                            _ => "unknown",
                        },
                        "path": file_path,
                        "vcsType": "svn",
                    }))
                })
                .collect();
            println!(
                "{}",
                serde_json::to_string_pretty(&serde_json::json!({
                    "vcsType": "svn",
                    "changes": changes,
                    "total": changes.len(),
                }))
                .unwrap_or_default()
            );
        } else {
            let trimmed = output.trim();
            if trimmed.is_empty() {
                println!("工作区干净，无变更");
            } else {
                println!("变更:");
                for line in trimmed.lines() {
                    println!("  {line}");
                }
            }
        }
        std::process::exit(0);
    }

    eprintln!("错误: 无法识别路径中的版本控制类型");
    std::process::exit(1);
}

fn exec_cli_update(path: Option<String>) {
    let path = match path {
        Some(p) => p,
        None => {
            eprintln!("错误: 请指定路径");
            std::process::exit(1);
        }
    };

    match do_update_repository(&path) {
        Ok(summary) => {
            println!("更新完成: {summary}");
            std::process::exit(0);
        }
        Err(error) => {
            eprintln!("错误: {error}");
            std::process::exit(1);
        }
    }
}

fn exec_cli_json(cmd: Option<&str>, path: Option<String>) {
    match cmd {
        Some("--gvmt-detect") => exec_cli_detect(path, true),
        Some("--gvmt-status") => exec_cli_status(path, true),
        Some(other) => {
            eprintln!("错误: --json 不支持与 {other} 搭配使用");
            std::process::exit(1);
        }
        None => {
            eprintln!("错误: --json 需要搭配 --gvmt-detect 或 --gvmt-status 使用");
            std::process::exit(1);
        }
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
        match detect_repository_impl(context.path.clone()) {
            Ok(detected) => crate::windows::show_message_box(
                "GVMT — 仓库检测",
                &format!(
                    "路径：{}\n类型：{}\n名称：{}",
                    detected.path, detected.vcs_type, detected.name
                ),
            ),
            Err(error) => crate::windows::show_message_box("GVMT — 检测失败", &error),
        }
        return true;
    }

    if context.action == "update" {
        let path = context.path.clone();
        let result = std::thread::spawn(move || do_update_repository(&path))
            .join()
            .unwrap_or_else(|_| Err("后台线程异常".to_string()));

        match result {
            Ok(summary) => crate::windows::show_message_box(
                "GVMT — 更新仓库",
                &format!("路径：{}\n{}", context.path, summary),
            ),
            Err(error) => {
                crate::windows::show_message_box("GVMT — 更新失败", &error);
            }
        }
        return true;
    }

    false
}

fn do_update_repository(path: &str) -> Result<String, String> {
    let detected = detect_repository_impl(path.to_string())?;

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

    let _id = if let Some(id) = existing {
        id
    } else {
        connection
            .execute(
                "INSERT INTO repositories (name, path, vcs_type, remote_url, branch_or_revision)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    detected.name,
                    detected.path,
                    detected.vcs_type,
                    detected.remote_url,
                    detected.branch_or_revision
                ],
            )
            .map_err(|e| e.to_string())?;
        connection.last_insert_rowid()
    };

    let results = match detected.vcs_type.as_str() {
        "git" => {
            let pull_out = run_command(["git", "-C", path, "pull", "--ff-only"])?;
            vec![OperationResult {
                operation: "update".to_string(),
                vcs_type: "git".to_string(),
                success: true,
                summary: if pull_out.contains("Already up to date") {
                    "Git 已是最新".to_string()
                } else {
                    "Git 更新完成".to_string()
                },
                output: pull_out,
                warning: None,
                missing_svn_cli: false,
            }]
        }
        "svn" => {
            let update_out = run_command(["svn", "update", path])?;
            vec![OperationResult {
                operation: "update".to_string(),
                vcs_type: "svn".to_string(),
                success: true,
                summary: "SVN 更新完成".to_string(),
                output: update_out,
                warning: None,
                missing_svn_cli: false,
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

fn detect_repository_impl(path: String) -> Result<DetectedRepository, String> {
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
