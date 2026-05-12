use crate::models::OperationResult;
use std::path::Path;

pub fn gitignore_append_rule(root_path: &str, rule: &str) -> Result<OperationResult, String> {
    let gitignore = Path::new(root_path).join(".gitignore");
    append_ignore_rule_to_file(&gitignore, rule, "Git", ".gitignore")
}

/// 向文件追加忽略规则（用于 .gitignore 和 .svnignore）
fn append_ignore_rule_to_file(
    file_path: &Path,
    rule: &str,
    vcs_name: &str,
    file_name: &str,
) -> Result<OperationResult, String> {
    let mut content = if file_path.exists() {
        std::fs::read_to_string(file_path).unwrap_or_default()
    } else {
        String::new()
    };

    let normalized_rule = rule.replace('\\', "/");
    if content.lines().any(|line| line.trim() == normalized_rule) {
        return Ok(OperationResult {
            operation: "ignore".to_string(),
            vcs_type: if vcs_name == "SVN" { "svn".to_string() } else { "git".to_string() },
            success: true,
            summary: format!("规则已在 {file_name} 中存在：{normalized_rule}"),
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

    std::fs::write(file_path, content.as_bytes()).map_err(|error| error.to_string())?;

    Ok(OperationResult {
        operation: "ignore".to_string(),
        vcs_type: if vcs_name == "SVN" { "svn".to_string() } else { "git".to_string() },
        success: true,
        summary: format!("已添加 {vcs_name} 忽略规则：{normalized_rule}"),
        output: String::new(),
        warning: None,
        missing_svn_cli: false,
    })
}

pub fn gitignore_remove_rule(root_path: &str, rule: &str) -> Result<OperationResult, String> {
    let gitignore = Path::new(root_path).join(".gitignore");
    remove_ignore_rule_from_file(&gitignore, rule, "Git", ".gitignore")
}

pub fn svnignore_remove_rule(root_path: &str, rule: &str) -> Result<OperationResult, String> {
    let svnignore = Path::new(root_path).join(".svnignore");
    remove_ignore_rule_from_file(&svnignore, rule, "SVN", ".svnignore")
}

fn remove_ignore_rule_from_file(
    file_path: &Path,
    rule: &str,
    vcs_name: &str,
    file_name: &str,
) -> Result<OperationResult, String> {
    let content = if file_path.exists() {
        std::fs::read_to_string(file_path).unwrap_or_default()
    } else {
        return Ok(OperationResult {
            operation: "ignore".to_string(),
            vcs_type: if vcs_name == "SVN" { "svn".to_string() } else { "git".to_string() },
            success: true,
            summary: format!("{file_name} 不存在，无需移除"),
            output: String::new(),
            warning: None,
            missing_svn_cli: false,
        });
    };

    let normalized_rule = rule.replace('\\', "/");
    let new_content: String = content
        .lines()
        .filter(|line| line.trim() != normalized_rule)
        .collect::<Vec<_>>()
        .join("\n");
    // 确保末尾有换行
    let new_content = if new_content.ends_with('\n') {
        new_content
    } else if new_content.is_empty() {
        new_content
    } else {
        format!("{new_content}\n")
    };

    if new_content.trim() == content.trim() {
        return Ok(OperationResult {
            operation: "ignore".to_string(),
            vcs_type: if vcs_name == "SVN" { "svn".to_string() } else { "git".to_string() },
            success: true,
            summary: format!("{file_name} 中未找到规则：{normalized_rule}"),
            output: String::new(),
            warning: None,
            missing_svn_cli: false,
        });
    }

    std::fs::write(file_path, new_content.as_bytes()).map_err(|error| error.to_string())?;

    Ok(OperationResult {
        operation: "ignore".to_string(),
        vcs_type: if vcs_name == "SVN" { "svn".to_string() } else { "git".to_string() },
        success: true,
        summary: format!("已从 {file_name} 移除规则：{normalized_rule}"),
        output: String::new(),
        warning: None,
        missing_svn_cli: false,
    })
}

pub fn svn_ignore_append_rule(root_path: &str, relative_path: &str) -> Result<OperationResult, String> {
    let root = Path::new(root_path);
    let svnignore = root.join(".svnignore");
    // 保留相对路径写入，目录尾部加 /
    let rule = if relative_path.ends_with('/') || relative_path.is_empty() {
        relative_path.to_string()
    } else if Path::new(root).join(relative_path.replace('/', std::path::MAIN_SEPARATOR_STR)).is_dir() {
        format!("{}/", relative_path)
    } else {
        relative_path.to_string()
    };

    append_ignore_rule_to_file(&svnignore, &rule, "SVN", ".svnignore")
}
