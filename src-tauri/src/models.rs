use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ── Repository / Detection ────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    pub id: i64,
    pub name: String,
    pub path: String,
    pub vcs_type: String,
    pub remote_url: Option<String>,
    pub branch_or_revision: Option<String>,
    pub notes: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedRepository {
    pub path: String,
    pub name: String,
    pub vcs_type: String,
    pub remote_url: Option<String>,
    pub branch_or_revision: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AddRepositoryInput {
    pub path: String,
    pub name: Option<String>,
}

// ── SVN Metadata ──────────────────────────────────────────────────────────

#[derive(Debug)]
pub struct SvnMetadata {
    pub remote_url: Option<String>,
    pub revision: Option<String>,
}

// ── Changes / Diff / Commit ───────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeItem {
    pub path: String,
    pub status: String,
    pub vcs_type: String,
    pub staged: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffRequest {
    pub path: String,
    pub vcs_type: String,
    pub status: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CommitFileRequest {
    pub path: String,
    pub vcs_type: String,
    pub status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitRequest {
    pub message: String,
    pub push: bool,
    pub files: Vec<CommitFileRequest>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryDiff {
    pub repository_id: i64,
    pub path: String,
    pub vcs_type: String,
    pub status: String,
    pub content: String,
    pub is_binary: bool,
    pub warning: Option<String>,
}

// ── Status ────────────────────────────────────────────────────────────────

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryStatusSummary {
    pub total: usize,
    pub added: usize,
    pub modified: usize,
    pub deleted: usize,
    pub untracked: usize,
    pub conflicted: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryStatus {
    pub repository_id: i64,
    pub vcs_type: String,
    pub clean: bool,
    pub warning: Option<String>,
    pub missing_svn_cli: bool,
    pub summary: RepositoryStatusSummary,
    pub changes: Vec<ChangeItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationResult {
    pub operation: String,
    pub vcs_type: String,
    pub success: bool,
    pub summary: String,
    pub output: String,
    pub warning: Option<String>,
    pub missing_svn_cli: bool,
}

// ── Startup ───────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StartupContext {
    pub action: String,
    pub path: String,
}

// ── Windows Context Menu ──────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowsContextMenuStatus {
    pub supported: bool,
    pub installed: bool,
    pub executable_path: Option<String>,
    pub warning: Option<String>,
}

// ── Quality Checks ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone, Copy)]
pub enum QualityCheckType {
    #[serde(rename = "typescriptBuild")]
    TypeScriptBuild,
    #[serde(rename = "playwrightUi")]
    PlaywrightUi,
    #[serde(rename = "cargoCheck")]
    CargoCheck,
}

impl QualityCheckType {
    pub fn key(self) -> &'static str {
        match self {
            QualityCheckType::TypeScriptBuild => "typescriptBuild",
            QualityCheckType::PlaywrightUi => "playwrightUi",
            QualityCheckType::CargoCheck => "cargoCheck",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            QualityCheckType::TypeScriptBuild => "TypeScript build",
            QualityCheckType::PlaywrightUi => "Playwright UI 测试",
            QualityCheckType::CargoCheck => "Rust cargo check",
        }
    }
}

#[derive(Debug, Clone)]
pub struct QualityCheckDefinition {
    pub check_type: QualityCheckType,
    pub label: &'static str,
    pub command: &'static str,
    pub program: &'static str,
    pub args: Vec<String>,
    pub cwd: PathBuf,
    pub unavailable_reason: Option<String>,
}

impl QualityCheckDefinition {
    pub fn into_template(self) -> QualityCheckTemplate {
        QualityCheckTemplate {
            check_type: self.check_type.key().to_string(),
            label: self.label.to_string(),
            command: self.command.to_string(),
            available: self.unavailable_reason.is_none(),
            unavailable_reason: self.unavailable_reason,
        }
    }

    pub fn unavailable_result(&self, reason: &str) -> QualityCheckResult {
        let now = crate::utils::now_epoch_seconds();
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

    pub fn run(&self) -> QualityCheckResult {
        use crate::command_exec::{decode_command_output, new_command, resolve_program};
        use crate::utils::{combine_command_streams, format_duration, now_epoch_seconds, summarize_check_output};
        use std::time::Instant;

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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QualityCheckTemplate {
    pub check_type: String,
    pub label: String,
    pub command: String,
    pub available: bool,
    pub unavailable_reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QualityCheckResult {
    pub check_type: String,
    pub label: String,
    pub command: String,
    pub status: String,
    pub success: bool,
    pub started_at: u64,
    pub finished_at: u64,
    pub duration_ms: u64,
    pub summary: String,
    pub output: String,
    pub warning: Option<String>,
}

// ── File Browser ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryFileEntry {
    pub name: String,
    pub path: String,
    pub entry_type: String,
    pub size: Option<u64>,
    pub modified_at: Option<u64>,
    pub children: Vec<RepositoryFileEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryDirectory {
    pub repository_id: i64,
    pub path: String,
    pub parent_path: Option<String>,
    pub entries: Vec<RepositoryFileEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryFilePreview {
    pub repository_id: i64,
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified_at: Option<u64>,
    pub content: String,
    pub is_binary: bool,
    pub warning: Option<String>,
}

// ── Ignore Rules ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IgnoreRules {
    pub vcs_type: String,
    pub gitignore_path: Option<String>,
    pub gitignore_content: Option<String>,
    pub svnignore_content: Option<String>,
    pub svn_entries: Vec<SvnIgnoreEntry>,
    pub skip_worktree_files: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SvnIgnoreEntry {
    pub directory: String,
    pub rules: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateGitignoreRequest {
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddIgnoreRuleRequest {
    pub path: String,
    pub vcs_type: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveIgnoreRuleRequest {
    pub path: String,
    pub vcs_type: String,
}

// ── Branches ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
}

// ── Operation Log ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationLog {
    pub id: i64,
    pub repository_id: Option<i64>,
    pub operation: String,
    pub vcs_type: String,
    pub success: bool,
    pub summary: String,
    pub output: String,
    pub warning: Option<String>,
    pub created_at: String,
}

// ── Clone / Checkout Progress ──────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CloneProgressStats {
    pub files: u32,
    pub size_mb: Option<f64>,
    pub speed_kbps: Option<f64>,
}
