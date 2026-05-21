use serde::{Deserialize, Serialize};

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
    #[serde(default)]
    pub path_exists: bool,
}

impl Repository {
    pub fn with_path_check(mut self) -> Self {
        self.path_exists = std::path::Path::new(&self.path).exists();
        self
    }
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

// ── Commit Hooks ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitHook {
    pub id: i64,
    pub repository_id: i64,
    pub hook_type: String,       // "pre-commit" | "post-commit"
    pub enabled: bool,
    pub shell: String,           // "cmd" | "powershell"
    pub script: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitHookInput {
    pub hook_type: String,
    pub enabled: bool,
    pub shell: String,
    pub script: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCommitHooksRequest {
    pub repository_id: i64,
    pub hooks: Vec<CommitHookInput>,
}

// ── Quality Scripts ───────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QualityScript {
    pub id: i64,
    pub repository_id: i64,
    pub name: String,
    pub enabled: bool,
    pub shell: String,
    pub script: String,
    pub last_status: Option<String>,
    pub last_duration_ms: Option<i64>,
    pub last_output: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QualityScriptInput {
    pub repository_id: i64,
    pub name: String,
    pub enabled: bool,
    pub shell: String,
    pub script: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestHookResult {
    pub success: bool,
    pub output: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QualityScriptResult {
    pub script_id: i64,
    pub success: bool,
    pub output: String,
    pub duration_ms: i64,
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
