use crate::models::{OperationLog, Repository};
use rusqlite::{params, Connection, OptionalExtension};
use std::{env, fs, path::PathBuf};
use tauri::Manager;

pub fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join("gvmt.sqlite"))
}

pub fn database_path_fallback() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(appdata) = env::var("APPDATA") {
            return PathBuf::from(appdata)
                .join("com.flowerdrunk.gvmt")
                .join("gvmt.sqlite");
        }
    }
    #[cfg(not(windows))]
    {
        if let Ok(home) = env::var("HOME") {
            return PathBuf::from(home)
                .join(".local/share/com.flowerdrunk.gvmt")
                .join("gvmt.sqlite");
        }
    }
    PathBuf::from("gvmt.sqlite")
}

pub fn open_database(app: &tauri::AppHandle) -> Result<Connection, String> {
    let db_path = database_path(app)?;
    let connection = Connection::open(db_path).map_err(|error| error.to_string())?;
    initialize_database(&connection)?;
    normalize_repository_paths(&connection)?;
    Ok(connection)
}

pub fn initialize_database(connection: &Connection) -> Result<(), String> {
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
            );
            CREATE TABLE IF NOT EXISTS operation_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                repository_id INTEGER,
                operation TEXT NOT NULL,
                vcs_type TEXT NOT NULL,
                success INTEGER NOT NULL,
                summary TEXT NOT NULL,
                output TEXT NOT NULL DEFAULT '',
                warning TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );",
        )
        .map_err(|error| error.to_string())
}

pub fn normalize_repository_paths(connection: &Connection) -> Result<(), String> {
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

pub fn find_repository_by_id(
    connection: &Connection,
    id: i64,
) -> Result<Option<Repository>, String> {
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

pub fn find_repository_by_path(
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

pub fn normalize_existing_path(path: String) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(path.trim());
    if !candidate.exists() {
        return Err("路径不存在".to_string());
    }
    candidate.canonicalize().map_err(|error| error.to_string())
}

pub fn path_to_display_string(path: &std::path::Path) -> Result<String, String> {
    let value = path
        .to_str()
        .ok_or_else(|| "路径包含无法处理的字符".to_string())?;
    Ok(strip_windows_extended_path_prefix(value))
}

pub fn strip_windows_extended_path_prefix(path: &str) -> String {
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

// ── Operation Logs ──────────────────────────────────────────────────────────

pub fn insert_operation_log(
    connection: &Connection,
    repository_id: Option<i64>,
    operation: &str,
    vcs_type: &str,
    success: bool,
    summary: &str,
    output: &str,
    warning: Option<&str>,
) -> Result<i64, String> {
    connection
        .execute(
            "INSERT INTO operation_logs (repository_id, operation, vcs_type, success, summary, output, warning)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![repository_id, operation, vcs_type, success, summary, output, warning],
        )
        .map_err(|error| error.to_string())?;
    Ok(connection.last_insert_rowid())
}

pub fn list_operation_logs(
    connection: &Connection,
    repository_id: Option<i64>,
    limit: i64,
    offset: i64,
) -> Result<Vec<OperationLog>, String> {
    let (sql, repo_param): (&str, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(repo_id) = repository_id {
        (
            "SELECT id, repository_id, operation, vcs_type, success, summary, output, warning, created_at
             FROM operation_logs
             WHERE repository_id = ?1
             ORDER BY created_at DESC
             LIMIT ?2 OFFSET ?3",
            vec![Box::new(repo_id), Box::new(limit), Box::new(offset)],
        )
    } else {
        (
            "SELECT id, repository_id, operation, vcs_type, success, summary, output, warning, created_at
             FROM operation_logs
             ORDER BY created_at DESC
             LIMIT ?1 OFFSET ?2",
            vec![Box::new(limit), Box::new(offset)],
        )
    };

    let mut statement = connection.prepare(sql).map_err(|error| error.to_string())?;
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = repo_param.iter().map(|p| p.as_ref()).collect();
    let rows = statement
        .query_map(params_refs.as_slice(), |row| {
            Ok(OperationLog {
                id: row.get(0)?,
                repository_id: row.get(1)?,
                operation: row.get(2)?,
                vcs_type: row.get(3)?,
                success: row.get::<_, i32>(4)? != 0,
                summary: row.get(5)?,
                output: row.get(6)?,
                warning: row.get(7)?,
                created_at: row.get(8)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(rows)
}

pub fn clear_old_operation_logs(connection: &Connection, before_days: i64) -> Result<usize, String> {
    connection
        .execute(
            "DELETE FROM operation_logs WHERE created_at < datetime('now', ?1)",
            params![format!("-{} days", before_days)],
        )
        .map_err(|error| error.to_string())
}
