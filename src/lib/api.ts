import { invoke } from "@tauri-apps/api/core";

export type VcsType = "git" | "svn" | "mixed" | "unknown";

export interface Repository {
  id: number;
  name: string;
  path: string;
  vcsType: VcsType;
  remoteUrl: string | null;
  branchOrRevision: string | null;
  notes: string;
  tags: string;
  createdAt: string;
  updatedAt: string;
  pathExists: boolean;
}

export interface DetectedRepository {
  path: string;
  name: string;
  vcsType: VcsType;
  remoteUrl: string | null;
  branchOrRevision: string | null;
}

export interface AddRepositoryInput {
  path: string;
  name?: string;
}

export type ChangeStatus = "added" | "modified" | "deleted" | "renamed" | "untracked" | "conflicted" | "missing" | "unknown";

export interface ChangeItem {
  path: string;
  status: ChangeStatus;
  vcsType: VcsType;
  staged: boolean;
  isDir?: boolean;
}

export interface RepositoryStatusSummary {
  total: number;
  added: number;
  modified: number;
  deleted: number;
  untracked: number;
  conflicted: number;
}

export interface RepositoryStatus {
  repositoryId: number;
  vcsType: VcsType;
  clean: boolean;
  warning: string | null;
  missingSvnCli: boolean;
  summary: RepositoryStatusSummary;
  changes: ChangeItem[];
}

export interface DiffRequest {
  path: string;
  vcsType: VcsType;
  status: ChangeStatus;
}

export interface CommitFileRequest {
  path: string;
  vcsType: VcsType;
  status: ChangeStatus;
}

export interface CommitRequest {
  message: string;
  push: boolean;
  files: CommitFileRequest[];
}

export interface RepositoryDiff {
  repositoryId: number;
  path: string;
  vcsType: VcsType;
  status: ChangeStatus;
  content: string;
  isBinary: boolean;
  warning: string | null;
}

export interface OperationResult {
  operation: string;
  vcsType: VcsType;
  success: boolean;
  summary: string;
  output: string;
  warning: string | null;
  missingSvnCli: boolean;
}

export type StartupAction = "open" | "detect" | "update" | "commit";

export interface StartupContext {
  action: StartupAction;
  path: string;
}

export interface WindowsContextMenuStatus {
  supported: boolean;
  installed: boolean;
  executablePath: string | null;
  warning: string | null;
}

export interface CommitHook {
  id: number;
  repositoryId: number;
  hookType: "pre-commit" | "post-commit";
  enabled: boolean;
  shell: "cmd" | "powershell";
  script: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommitHookInput {
  hookType: "pre-commit" | "post-commit";
  enabled: boolean;
  shell: "cmd" | "powershell";
  script: string;
}

export interface SaveCommitHooksRequest {
  repositoryId: number;
  hooks: CommitHookInput[];
}

export interface QualityScript {
  id: number;
  repositoryId: number;
  name: string;
  enabled: boolean;
  shell: "cmd" | "powershell";
  script: string;
  lastStatus: string | null;
  lastDurationMs: number | null;
  lastOutput: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QualityScriptInput {
  repositoryId: number;
  name: string;
  enabled: boolean;
  shell: "cmd" | "powershell";
  script: string;
}

export interface QualityScriptResult {
  scriptId: number;
  success: boolean;
  output: string;
  durationMs: number;
}

export const QUALITY_SCRIPT_TEMPLATES = [
  { name: "TypeScript 类型检查", shell: "cmd" as const, script: "npx tsc --noEmit" },
  { name: "Rust 编译检查", shell: "cmd" as const, script: "cargo check" },
  { name: "Playwright E2E", shell: "cmd" as const, script: "npx playwright test" },
  { name: "Prettier 格式检查", shell: "cmd" as const, script: "npx prettier --check ." },
  { name: "ESLint", shell: "cmd" as const, script: "npx eslint ." },
];

export type RepositoryFileEntryType = "directory" | "file";

export interface RepositoryFileEntry {
  name: string;
  path: string;
  entryType: RepositoryFileEntryType;
  size: number | null;
  modifiedAt: number | null;
  children: RepositoryFileEntry[];
}

export interface RepositoryDirectory {
  repositoryId: number;
  path: string;
  parentPath: string | null;
  entries: RepositoryFileEntry[];
}

export interface RepositoryFilePreview {
  repositoryId: number;
  path: string;
  name: string;
  size: number;
  modifiedAt: number | null;
  content: string;
  isBinary: boolean;
  warning: string | null;
}

export function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

export async function listRepositories(): Promise<Repository[]> {
  if (!isTauriRuntime()) return [];
  return invoke<Repository[]>("list_repositories");
}

export async function addRepository(input: AddRepositoryInput): Promise<Repository> {
  return invoke<Repository>("add_repository", { input });
}

export interface CloneRepositoryInput {
  url: string;
  path: string;
  shallow?: boolean;
  ignoreExternals?: boolean;
}

export async function cloneRepository(input: CloneRepositoryInput): Promise<Repository> {
  return invoke<Repository>("clone_repository", { input });
}

export async function openInExplorer(path: string): Promise<void> {
  return invoke<void>("open_in_explorer", { path });
}

export async function cancelOperation(): Promise<void> {
  return invoke<void>("cancel_operation");
}

export interface UpdateRepositoryInfoInput {
  name?: string;
  notes?: string;
  path?: string;
  remoteUrl?: string;
}

export async function updateRepositoryInfo(id: number, input: UpdateRepositoryInfoInput): Promise<Repository> {
  return invoke<Repository>("update_repository_info", { id, input });
}

export async function deleteRepository(id: number): Promise<void> {
  return invoke<void>("delete_repository", { id });
}

export async function updateRepositoryTags(id: number, tags: string): Promise<Repository> {
  return invoke<Repository>("update_repository_tags", { id, tags });
}

export async function detectRepository(path: string): Promise<DetectedRepository> {
  return invoke<DetectedRepository>("detect_repository", { path });
}

export async function refreshRepository(id: number): Promise<Repository> {
  return invoke<Repository>("refresh_repository", { id });
}

export async function getRepositoryStatus(id: number): Promise<RepositoryStatus> {
  return invoke<RepositoryStatus>("get_repository_status", { id });
}

export async function getRepositoryDiff(id: number, input: DiffRequest): Promise<RepositoryDiff> {
  return invoke<RepositoryDiff>("get_repository_diff", { id, input });
}

export async function openSvnCliDownloadPage(target: "tortoise" | "sliksvn"): Promise<void> {
  return invoke<void>("open_svn_cli_download_page", { target });
}

export async function updateRepository(id: number, depth?: string): Promise<OperationResult[]> {
  return invoke<OperationResult[]>("update_repository", { id, depth: depth ?? null });
}

export async function consumeStartupContext(): Promise<StartupContext | null> {
  return invoke<StartupContext | null>("consume_startup_context");
}

export async function getWindowsContextMenuStatus(): Promise<WindowsContextMenuStatus> {
  return invoke<WindowsContextMenuStatus>("get_windows_context_menu_status");
}

export async function installWindowsContextMenu(): Promise<WindowsContextMenuStatus> {
  return invoke<WindowsContextMenuStatus>("install_windows_context_menu");
}

export async function uninstallWindowsContextMenu(): Promise<WindowsContextMenuStatus> {
  return invoke<WindowsContextMenuStatus>("uninstall_windows_context_menu");
}

export async function getCommitHooks(repositoryId: number): Promise<CommitHook[]> {
  return invoke<CommitHook[]>("get_commit_hooks", { repositoryId });
}

export async function saveCommitHooks(input: SaveCommitHooksRequest): Promise<void> {
  return invoke<void>("save_commit_hooks", { input });
}

export interface TestHookResult {
  success: boolean;
  output: string;
}

export async function testHookScript(shell: string, script: string): Promise<TestHookResult> {
  return invoke<TestHookResult>("test_hook_script", { shell, script });
}

export async function getQualityScripts(repositoryId: number): Promise<QualityScript[]> {
  return invoke<QualityScript[]>("get_quality_scripts", { repositoryId });
}

export async function saveQualityScript(input: QualityScriptInput): Promise<QualityScript> {
  return invoke<QualityScript>("save_quality_script", { input });
}

export async function deleteQualityScript(id: number): Promise<void> {
  return invoke<void>("delete_quality_script", { id });
}

export async function runQualityScript(id: number): Promise<QualityScriptResult> {
  return invoke<QualityScriptResult>("run_quality_script", { id });
}

export async function runAllQualityScripts(repositoryId: number): Promise<QualityScriptResult[]> {
  return invoke<QualityScriptResult[]>("run_all_quality_scripts", { repositoryId });
}

export async function commitRepository(id: number, input: CommitRequest): Promise<OperationResult[]> {
  return invoke<OperationResult[]>("commit_repository", { id, input });
}

export async function retryPush(id: number): Promise<OperationResult> {
  return invoke<OperationResult>("retry_push", { id });
}

export async function stageAllFiles(id: number): Promise<OperationResult> {
  return invoke<OperationResult>("stage_all_files", { id });
}

export async function unstageAllFiles(id: number): Promise<OperationResult> {
  return invoke<OperationResult>("unstage_all_files", { id });
}

export async function unstageFile(id: number, path: string): Promise<OperationResult> {
  return invoke<OperationResult>("unstage_file", { id, path });
}

// ── Git Stash ────────────────────────────────────────────────────────────────

export async function gitStashPush(id: number, message?: string): Promise<OperationResult> {
  return invoke<OperationResult>("git_stash_push", { id, message: message ?? null });
}

export async function gitStashPop(id: number): Promise<OperationResult> {
  return invoke<OperationResult>("git_stash_pop", { id });
}

export interface GitStashEntry {
  index: number;
  message: string;
}

export async function gitStashList(id: number): Promise<GitStashEntry[]> {
  return invoke<GitStashEntry[]>("git_stash_list", { id });
}

export async function gitStashDrop(id: number, index: number): Promise<OperationResult> {
  return invoke<OperationResult>("git_stash_drop", { id, index });
}

// ── Git Log ──────────────────────────────────────────────────────────────────

export interface GitCommitLog {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export async function gitLog(id: number, maxCount?: number): Promise<GitCommitLog[]> {
  return invoke<GitCommitLog[]>("git_log", { id, maxCount: maxCount ?? null });
}

// ── Git Fetch ─────────────────────────────────────────────────────────────────

export async function gitFetch(id: number): Promise<OperationResult> {
  return invoke<OperationResult>("git_fetch", { id });
}

// ── Git Reset ─────────────────────────────────────────────────────────────────

export async function gitReset(id: number, mode: string, target: string): Promise<OperationResult> {
  return invoke<OperationResult>("git_reset", { id, mode, target });
}

// ── SVN Revert / Cleanup / Resolve / Log ──────────────────────────────────────

export async function svnRevert(id: number, path: string): Promise<OperationResult> {
  return invoke<OperationResult>("svn_revert", { id, path });
}

export async function svnCleanup(id: number): Promise<OperationResult> {
  return invoke<OperationResult>("svn_cleanup", { id });
}

export async function svnResolve(id: number, path: string): Promise<OperationResult> {
  return invoke<OperationResult>("svn_resolve", { id, path });
}

export type SvnAcceptType = "base" | "working" | "mine-full" | "theirs-full";

export async function svnResolveAccept(id: number, path: string, accept: SvnAcceptType): Promise<OperationResult> {
  return invoke<OperationResult>("svn_resolve_accept", { id, path, accept });
}

export async function svnUpdateForce(id: number, depth?: string): Promise<OperationResult> {
  return invoke<OperationResult>("svn_update_force", { id, depth: depth ?? null });
}

export async function forceUpdateRepository(id: number, depth?: string): Promise<OperationResult> {
  return invoke<OperationResult>("svn_update_force_streaming_cmd", { id, depth: depth ?? null });
}

export interface SvnCommitLog {
  revision: number;
  author: string;
  date: string;
  message: string;
}

export async function svnLog(id: number, maxCount?: number): Promise<SvnCommitLog[]> {
  return invoke<SvnCommitLog[]>("svn_log_command", { id, maxCount: maxCount ?? null });
}

export interface CommitFileChange {
  path: string;
  changeType: string;
}

export interface CommitDetail {
  hash: string;
  author: string;
  date: string;
  message: string;
  files: CommitFileChange[];
  diff: string;
}

export async function gitShowDetail(id: number, hash: string): Promise<CommitDetail> {
  return invoke<CommitDetail>("git_show_detail", { id, hash });
}

export async function svnShowDetail(id: number, revision: number): Promise<CommitDetail> {
  return invoke<CommitDetail>("svn_show_detail", { id, revision });
}

export async function listRepositoryFiles(id: number, relativePath?: string): Promise<RepositoryDirectory> {
  return invoke<RepositoryDirectory>("list_repository_files", { id, relativePath });
}

export async function readRepositoryFile(id: number, relativePath: string): Promise<RepositoryFilePreview> {
  return invoke<RepositoryFilePreview>("read_repository_file", { id, relativePath });
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
}

export async function listBranches(id: number): Promise<BranchInfo[]> {
  return invoke<BranchInfo[]>("list_branches", { id });
}

export async function switchBranch(id: number, branch: string): Promise<OperationResult> {
  return invoke<OperationResult>("switch_branch", { id, branch });
}

// ── Operation Logs ─────────────────────────────────────────────────────────

export interface OperationLog {
  id: number;
  repositoryId: number | null;
  operation: string;
  vcsType: VcsType;
  success: boolean;
  summary: string;
  output: string;
  warning: string | null;
  createdAt: string;
}

export async function logOperation(params: {
  repositoryId: number | null;
  operation: string;
  vcsType: VcsType;
  success: boolean;
  summary: string;
  output?: string;
  warning?: string | null;
}): Promise<number> {
  return invoke<number>("log_operation", {
    repositoryId: params.repositoryId,
    operation: params.operation,
    vcsType: params.vcsType,
    success: params.success,
    summary: params.summary,
    output: params.output ?? "",
    warning: params.warning,
  });
}

export async function listOperationLogs(
  repositoryId?: number,
  limit?: number,
  offset?: number,
): Promise<OperationLog[]> {
  return invoke<OperationLog[]>("list_operation_logs", {
    repositoryId: repositoryId ?? null,
    limit: limit ?? null,
    offset: offset ?? null,
  });
}

export async function clearOperationLogs(beforeDays?: number): Promise<number> {
  return invoke<number>("clear_operation_logs", {
    beforeDays: beforeDays ?? null,
  });
}

// ── GitHub / gh Integration ───────────────────────────────────────────────

export interface GhStatus {
  installed: boolean;
  authenticated: boolean;
  authUser: string | null;
  error: string | null;
}

export interface GhOwnerRepo {
  owner: string;
  name: string;
}

export interface GhRepoInfo {
  owner: string;
  name: string;
  description: string | null;
  url: string;
  defaultBranch: string;
  primaryLanguage: string | null;
  isPrivate: boolean;
}

export interface GitHubEntry {
  name: string;
  path: string;
  entryType: "file" | "directory";
  size: number | null;
}

export interface GitHubDirectory {
  entries: GitHubEntry[];
}

export interface GitHubFileContent {
  name: string;
  path: string;
  content: string;
  size: number;
  isBinary: boolean;
}

export interface GitHubPr {
  number: number;
  title: string;
  state: string;
  author: string | null;
  createdAt: string;
  headRef: string;
  baseRef: string;
  url: string;
}

export interface GhCreatePrInput {
  title: string;
  body: string;
  head: string;
  base: string;
}

export interface GitHubPrList {
  prs: GitHubPr[];
}

export interface GitHubRun {
  name: string;
  headBranch: string;
  status: string;
  conclusion: string | null;
  createdAt: string;
  url: string;
}

export interface GitHubRunList {
  runs: GitHubRun[];
}

export async function checkGhStatus(): Promise<GhStatus> {
  return invoke<GhStatus>("check_gh_status");
}

export async function getGhRepoInfo(remoteUrl: string): Promise<GhRepoInfo> {
  return invoke<GhRepoInfo>("get_gh_repo_info", { remoteUrl });
}

export async function ghListDirectory(
  remoteUrl: string,
  path: string,
  reference?: string,
): Promise<GitHubDirectory> {
  return invoke<GitHubDirectory>("gh_list_directory", {
    remoteUrl,
    path,
    reference: reference ?? null,
  });
}

export async function ghReadFile(
  remoteUrl: string,
  path: string,
  reference?: string,
): Promise<GitHubFileContent> {
  return invoke<GitHubFileContent>("gh_read_file", {
    remoteUrl,
    path,
    reference: reference ?? null,
  });
}

export async function ghListPrs(
  remoteUrl: string,
  state?: string,
): Promise<GitHubPrList> {
  return invoke<GitHubPrList>("gh_list_prs", {
    remoteUrl,
    state: state ?? null,
  });
}

export async function ghListActions(remoteUrl: string): Promise<GitHubRunList> {
  return invoke<GitHubRunList>("gh_list_actions", { remoteUrl });
}

export async function ghOpenBrowser(remoteUrl: string, page: string): Promise<void> {
  return invoke<void>("gh_open_browser", { remoteUrl, page });
}

export async function createPr(remoteUrl: string, input: GhCreatePrInput): Promise<GitHubPr> {
  return invoke<GitHubPr>("gh_create_pr", { remoteUrl, input });
}

export async function parseRemoteOwnerRepo(remoteUrl: string): Promise<GhOwnerRepo | null> {
  return invoke<GhOwnerRepo | null>("parse_remote_owner_repo", { remoteUrl });
}

// ── SVN Remote File Browsing ──────────────────────────────────────────────

export interface SvnRemoteEntry {
  name: string;
  entryType: "file" | "directory";
}

export interface SvnRemoteDirectory {
  entries: SvnRemoteEntry[];
  path: string;
  parentPath: string | null;
}

export async function svnRemoteList(url: string): Promise<SvnRemoteDirectory> {
  return invoke<SvnRemoteDirectory>("svn_remote_list", { url });
}

export async function pickFolder(): Promise<string | null> {
  return invoke<string | null>("pick_folder");
}

export async function svnRemoteCat(url: string): Promise<string> {
  return invoke<string>("svn_remote_cat", { url });
}

// ── Remote Update Detection ──────────────────────────────────────────────

export interface RemoteUpdateStatus {
  hasUpdates: boolean;
  details: string | null;
}

export async function checkRemoteUpdates(id: number): Promise<RemoteUpdateStatus> {
  return invoke<RemoteUpdateStatus>("check_remote_updates", { id });
}

export interface SvnIgnoreEntry {
  directory: string;
  rules: string[];
}

export interface IgnoreRules {
  vcsType: VcsType;
  gitignorePath: string | null;
  gitignoreContent: string | null;
  svnignoreContent: string | null;
  svnEntries: SvnIgnoreEntry[];
  skipWorktreeFiles: string[];
}

export async function getIgnoreRules(id: number): Promise<IgnoreRules> {
  return invoke<IgnoreRules>("get_ignore_rules", { id });
}

export async function addIgnoreRule(
  id: number,
  input: { path: string; vcsType: VcsType },
): Promise<OperationResult> {
  return invoke<OperationResult>("add_ignore_rule", { id, input });
}

export async function removeIgnoreRule(
  id: number,
  input: { path: string; vcsType: VcsType },
): Promise<OperationResult> {
  return invoke<OperationResult>("remove_ignore_rule", { id, input });
}

export async function updateGitignore(
  id: number,
  input: { content: string },
): Promise<OperationResult> {
  return invoke<OperationResult>("update_gitignore", { id, input });
}

export async function updateSvnIgnore(
  id: number,
  content: string,
): Promise<OperationResult> {
  return invoke<OperationResult>("update_svn_ignore", { id, content });
}
