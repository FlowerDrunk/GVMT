use crate::models::{ChangeItem, OperationResult, RepositoryStatusSummary};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn success_operation(
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

pub fn failed_operation(
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

pub fn format_duration(duration_ms: u64) -> String {
    if duration_ms < 1_000 {
        format!("{duration_ms}ms")
    } else {
        format!("{:.1}s", duration_ms as f64 / 1_000.0)
    }
}

pub fn now_epoch_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

pub fn combine_command_streams(stdout: &str, stderr: &str) -> String {
    match (stdout.trim().is_empty(), stderr.trim().is_empty()) {
        (true, true) => String::new(),
        (false, true) => stdout.trim().to_string(),
        (true, false) => stderr.trim().to_string(),
        (false, false) => format!("{}\n\n{}", stdout.trim(), stderr.trim()),
    }
}

pub fn summarize_check_output(output: &str) -> String {
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

pub fn slice_from_char(value: &str, char_index: usize) -> Option<&str> {
    if char_index == 0 {
        return Some(value);
    }

    value
        .char_indices()
        .nth(char_index)
        .map(|(index, _)| &value[index..])
}

pub fn summarize_changes(changes: &[ChangeItem]) -> RepositoryStatusSummary {
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
