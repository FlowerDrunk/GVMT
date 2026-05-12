import { invoke } from "@tauri-apps/api/core";

export type VcsType = "git" | "svn" | "mixed" | "unknown";

export interface Repository {
  id: number;
  name: string;
  path: string;
  vcsType: VcsType;
  remoteUrl: string | null;
  branchOrRevision: string | null;
  createdAt: string;
  updatedAt: string;
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

export type ChangeStatus = "added" | "modified" | "deleted" | "renamed" | "untracked" | "conflicted" | "unknown";

export interface ChangeItem {
  path: string;
  status: ChangeStatus;
  vcsType: VcsType;
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

export type QualityCheckType = "typescriptBuild" | "playwrightUi" | "cargoCheck";
export type QualityCheckStatus = "idle" | "running" | "success" | "failed";

export interface QualityCheckTemplate {
  checkType: QualityCheckType;
  label: string;
  command: string;
  available: boolean;
  unavailableReason: string | null;
}

export interface QualityCheckResult {
  checkType: QualityCheckType;
  label: string;
  command: string;
  status: Exclude<QualityCheckStatus, "idle" | "running">;
  success: boolean;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  summary: string;
  output: string;
  warning: string | null;
}

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

export async function deleteRepository(id: number): Promise<void> {
  return invoke<void>("delete_repository", { id });
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

export async function listQualityChecks(id: number): Promise<QualityCheckTemplate[]> {
  return invoke<QualityCheckTemplate[]>("list_quality_checks", { id });
}

export async function runQualityCheck(id: number, checkType: QualityCheckType): Promise<QualityCheckResult> {
  return invoke<QualityCheckResult>("run_quality_check", { id, checkType });
}

export async function commitRepository(id: number, input: CommitRequest): Promise<OperationResult[]> {
  return invoke<OperationResult[]>("commit_repository", { id, input });
}

export async function retryPush(id: number): Promise<OperationResult> {
  return invoke<OperationResult>("retry_push", { id });
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

export interface SvnCommitLog {
  revision: number;
  author: string;
  date: string;
  message: string;
}

export async function svnLog(id: number, maxCount?: number): Promise<SvnCommitLog[]> {
  return invoke<SvnCommitLog[]>("svn_log_command", { id, maxCount: maxCount ?? null });
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
