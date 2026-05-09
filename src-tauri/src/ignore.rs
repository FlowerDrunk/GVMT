use crate::models::OperationResult;
use std::path::Path;

use crate::command_exec::{os_str_to_string, run_command, run_command_args};

pub fn gitignore_append_rule(root_path: &str, rule: &str) -> Result<OperationResult, String> {
    let gitignore = Path::new(root_path).join(".gitignore");
    let mut content = if gitignore.exists() {
        std::fs::read_to_string(&gitignore).unwrap_or_default()
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

    std::fs::write(&gitignore, content.as_bytes()).map_err(|error| error.to_string())?;

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

pub fn svn_ignore_append_rule(root_path: &str, relative_path: &str) -> Result<OperationResult, String> {
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
