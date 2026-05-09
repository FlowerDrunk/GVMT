use crate::models::{
    QualityCheckDefinition, QualityCheckResult, QualityCheckTemplate, QualityCheckType,
};
use std::path::{Path, PathBuf};

use crate::db::find_repository_by_id;
use rusqlite::Connection;

pub fn quality_check_definition(
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
    std::fs::read_to_string(package_json)
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

/// Tauri command: list quality checks for a repository
pub fn list_quality_checks_impl(
    connection: &Connection,
    id: i64,
) -> Result<Vec<QualityCheckTemplate>, String> {
    let repository =
        find_repository_by_id(connection, id)?.ok_or_else(|| "未找到需要检查的仓库".to_string())?;

    Ok([
        QualityCheckType::TypeScriptBuild,
        QualityCheckType::PlaywrightUi,
        QualityCheckType::CargoCheck,
    ]
    .into_iter()
    .map(|check_type| quality_check_definition(&repository.path, check_type).into_template())
    .collect())
}

/// Tauri command: run a single quality check
pub fn run_quality_check_impl(
    connection: &Connection,
    id: i64,
    check_type: QualityCheckType,
) -> Result<QualityCheckResult, String> {
    let repository =
        find_repository_by_id(connection, id)?.ok_or_else(|| "未找到需要检查的仓库".to_string())?;
    let definition = quality_check_definition(&repository.path, check_type);

    if let Some(reason) = &definition.unavailable_reason {
        return Ok(definition.unavailable_result(reason));
    }

    Ok(definition.run())
}
