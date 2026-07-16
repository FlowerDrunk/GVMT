import { FormEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { changeKey, getVcsLabels } from "./lib/constants";
import { applyDocumentLanguage, createTranslator } from "./lib/i18n";
import {
  addRepository,
  checkRemoteUpdates,
  commitRepository,
  consumeStartupContext,
  detectRepository,
  getRepositoryStatus,
  getWindowsContextMenuStatus,
  installWindowsContextMenu,
  isTauriRuntime,
  retryPush,
  stageAllFiles,
  unstageAllFiles,
  unstageFile,
  type RemoteUpdateStatus,
  type WindowsContextMenuStatus,
  uninstallWindowsContextMenu,
  updateRepository,
  forceUpdateRepository,
  cloneRepository,
  cancelOperation,
  type ChangeStatus,
  type OperationResult,
  VcsType,
} from "./lib/api";
import {
  buildChangeNodeMap,
  buildChangeTree,
  buildFileEntryMap,
  changeTreeToViewNodes,
  ChangeTreeNode,
  fileBreadcrumbs,
  formatFileSize,
  formatModifiedAt,
  toFileTreeNodes,
} from "./lib/utils";
import { ChangeBadge } from "./components/shared/ChangeBadge";
import { type TreeViewNode } from "./components/shared/TreeView";
import { CommitDialog } from "./components/dialogs/CommitDialog";
import { DeleteConfirmDialog } from "./components/dialogs/DeleteConfirmDialog";
import { IgnoreDialog } from "./components/dialogs/IgnoreDialog";
import { SettingsDialog } from "./components/dialogs/SettingsDialog";
import { useCommit } from "./hooks/useCommit";
import { useContextMenu } from "./hooks/useContextMenu";
import { useVisibleSections } from "./hooks/useVisibleSections";
import { useRepositories } from "./hooks/useRepositories";
import { useRepositoryStatus } from "./hooks/useRepositoryStatus";
import { useFileTree } from "./hooks/useFileTree";
import { useChangeTree } from "./hooks/useChangeTree";
import { useIgnoreRules } from "./hooks/useIgnoreRules";
import { useSettings } from "./hooks/useSettings";
import { useOperationHistory } from "./hooks/useOperationHistory";
import { useToast } from "./hooks/useToast";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useUpdateProgress } from "./hooks/useUpdateProgress";
import { useCardOrder } from "./hooks/useCardOrder";
import { ToastContainer } from "./components/workspace/ToastContainer";
import { ActivityRail } from "./components/layout/ActivityRail";
import { CommandBar } from "./components/layout/CommandBar";
import { ExplorerPane } from "./components/panels/ExplorerPane";
import { FileBrowserPanel } from "./components/panels/FileBrowserPanel";
import { RepositorySummaryPanel } from "./components/panels/RepositorySummaryPanel";
import { StatusPanel } from "./components/panels/StatusPanel";
import { ChangesPane } from "./components/panels/ChangesPane";
import { ReviewPane } from "./components/panels/ReviewPane";
import { ThemeDialog } from "./components/panels/ThemePane";
import { UpdateProgressDialog } from "./components/workspace/UpdateProgressDialog";
import { OperationPanel, OperationDetailModal, type DetailSource } from "./components/workspace/OperationPanel";
import { BranchSwitcher } from "./components/workspace/BranchSwitcher";
import { StatusBar, IgnoreContextMenuOverlay } from "./components/workspace/StatusBar";
import { UpdateNotificationPanel } from "./components/workspace/UpdateNotificationPanel";
import { TabPanel } from "./components/shared/TabPanel";
import { DraggableCard } from "./components/shared/DraggableCard";
import { Modal, ModalHeading } from "./components/shared/Modal";
import { DiffCodeBlock } from "./components/shared/CodeBlock";
import { WorkspaceProvider, useWorkspace } from "./lib/WorkspaceContext";

function AppContent() {
  const { t, settings, updateSettings, showToast, toasts, removeToast } = useWorkspace();

  const [isLoading, setIsLoading] = useState(true);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isBranchSwitcherOpen, setIsBranchSwitcherOpen] = useState(false);
  const [activeSidebarTab, setActiveSidebarTab] = useState<string>("changes");
  const [windowsContextMenuStatus, setWindowsContextMenuStatus] = useState<WindowsContextMenuStatus | null>(null);
  const [isWindowsContextMenuLoading, setIsWindowsContextMenuLoading] = useState(false);
  const [status, setStatus] = useState(t("status.starting"));
  const startupContextHandledRef = useRef(false);

  const { visibleSections, toggleSection } = useVisibleSections();
  const ignoreContextMenu = useContextMenu<{ path: string; vcsType: VcsType; status?: ChangeStatus }>();

  const repo = useRepositories({ setStatus, setIsLoading, t });

  // Track initial load completion
  useEffect(() => {
    if (!isLoading && !hasInitialized && repo.repositories.length >= 0) {
      setHasInitialized(true);
      if (repo.repositories.length === 0) {
        setStatus(t("status.startupReady"));
      }
    }
  }, [isLoading, hasInitialized, repo.repositories.length]);

  const operationHistory = useOperationHistory(repo.selectedRepository?.id);

  const statusHook = useRepositoryStatus({
    selectedRepository: repo.selectedRepository,
    autoRefresh: settings.autoRefresh,
    refreshIntervalMs: settings.refreshIntervalMs,
    setStatus,
    setIsLoading,
    t,
  });

  const changedFiles = statusHook.repositoryStatus?.changes ?? [];
  const commit = useCommit({ selectedRepository: repo.selectedRepository, changedFiles });

  statusHook.syncKeysRef.current = commit.syncKeys;

  const fileTree = useFileTree({ selectedRepository: repo.selectedRepository, setStatus, t });
  const changeTree = useChangeTree({ selectedRepository: repo.selectedRepository, setStatus, t });
  const updateProgress = useUpdateProgress();
  const [isCloning, setIsCloning] = useState(false);
  const [commitResults, setCommitResults] = useState<OperationResult[] | null>(null);
  const [remoteBehind, setRemoteBehind] = useState<RemoteUpdateStatus | null>(null);
  const vcsLabels = useMemo(() => getVcsLabels(t), [t]);
  const handleCommitDialogClose = useCallback(() => {
    commit.setIsCommitDialogOpen(false);
    commit.setCommitError(null);
    setCommitResults(null);
  }, [commit.setIsCommitDialogOpen, commit.setCommitError, setCommitResults]);
  const [commitProgressOpen, setCommitProgressOpen] = useState(false);
  const [commitProgressLines, setCommitProgressLines] = useState<string[]>([]);
  const [commitCompleted, setCommitCompleted] = useState(false);
  const [commitDismissed, setCommitDismissed] = useState(false);
  const [cloneDismissed, setCloneDismissed] = useState(false);
  const [cloneLines, setCloneLines] = useState<string[]>([]);
  const [clonePct, setClonePct] = useState<number | null>(null);
  const [cloneStats, setCloneStats] = useState<{ files: number; sizeMb?: number; speedKbps?: number } | null>(null);
  const [expandedProgressRepo, setExpandedProgressRepo] = useState<number | null>(null);

  const [latestSvnRevisions, setLatestSvnRevisions] = useState<Record<number, string>>({});
  function handleLatestSvnRevision(repoId: number, revision: string) {
    setLatestSvnRevisions((prev) => ({ ...prev, [repoId]: revision }));
  }

  const [failureDetail, setFailureDetail] = useState<DetailSource | null>(null);
  const [failureDetailOpen, setFailureDetailOpen] = useState(false);
  function showOperationFailure(results: OperationResult[]) {
    const failed = results.find((r) => !r.success && r.operation !== "push");
    if (failed) {
      setFailureDetail({ kind: "result", result: failed });
      setFailureDetailOpen(true);
    }
  }

  // 监听 operationResults 变化，对非 commit 操作（如 update）弹出失败提示
  const prevResultsRef = useRef(0);
  useEffect(() => {
    const current = statusHook.operationResults.length;
    if (current > prevResultsRef.current && current > 0) {
      prevResultsRef.current = current;
      const results = statusHook.operationResults;
      const failed = results.find((r) => !r.success && r.operation !== "push" && r.operation !== "commit");
      if (failed) {
        setFailureDetail({ kind: "result", result: failed });
        setFailureDetailOpen(true);
      }
    } else if (current === 0) {
      prevResultsRef.current = 0;
    }
  }, [statusHook.operationResults]);

  const ignore = useIgnoreRules({
    selectedRepository: repo.selectedRepository,
    loadRepositoryStatus: statusHook.loadRepositoryStatus,
    setOperationResults: statusHook.setOperationResults,
    onCloseContextMenu: ignoreContextMenu.close,
    setStatus,
    t,
  });

  const cardOrder = useCardOrder();

  useEffect(() => {
    applyDocumentLanguage(settings.language);
  }, [settings.language]);

  useEffect(() => {
    if (!isTauriRuntime() || startupContextHandledRef.current) return;
    startupContextHandledRef.current = true;
    void handleStartupContext();
  }, []);

  useEffect(() => {
    if (!isTauriRuntime() || startupContextHandledRef.current) return;
    // Lazy-load context menu status only when settings are opened
  }, []);

  useEffect(() => {
    fileTree.reset();
    changeTree.reset();
    commit.resetCommitState();
    statusHook.setOperationResults([]);
    repo.setRepositoryPendingDelete(null);
    ignore.reset();
    ignoreContextMenu.close();
    setRemoteBehind(null);

    const r = repo.selectedRepository;
    if (r && r.remoteUrl && r.pathExists) {
      checkRemoteUpdates(r.id).then((status) => {
        if (status.hasUpdates) setRemoteBehind(status);
      }).catch(() => {});
    }
  }, [repo.selectedRepository?.id]);

  async function handleCommitRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!repo.selectedRepository) {
      setStatus(t("status.selectRepoFirst"));
      return;
    }

    const selectedFiles = commit.committableFiles.filter(
      (change) => commit.selectedCommitKeys.has(changeKey(change)),
    );
    if (selectedFiles.length === 0) {
      setStatus(t("status.selectFilesToCommit"));
      return;
    }
    if (!commit.commitMessageRef.current.trim()) {
      setStatus(t("status.enterCommitMessage"));
      return;
    }

    commit.setIsCommitLoading(true);
    commit.setCommitError(null);
    commit.setCommitHash(null);
    // Close commit dialog immediately, show progress at workspace level
    commit.setIsCommitDialogOpen(false);
    setCommitProgressOpen(true);
    setCommitDismissed(false);
    setCommitCompleted(false);
    setCommitProgressLines([]);
    let unlisten: (() => void) | null = null;
    if (isTauriRuntime()) {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<OperationResult>("commit-step", (e) => {
          const r = e.payload;
          setCommitProgressLines((prev) => [
            ...prev,
            `── ${r.operation} ${r.success ? "✓" : "✗"} ──`,
            ...(r.output ? r.output.split("\n") : ["无输出"]),
          ]);
        });
      } catch { /* ignore */ }
    }
    try {
      const results = await commitRepository(repo.selectedRepository.id, {
        message: commit.commitMessageRef.current,
        push: commit.pushAfterCommit,
        files: selectedFiles,
      });
      statusHook.setOperationResults(results);
      operationHistory.addEntry(results);
      const failed = results.filter((result) => !result.success);
      const commitSuccess = results.some((r) => r.operation === "commit" && r.success);
      const pushFailed = results.some((r) => r.operation === "push" && !r.success);
      const commitOutput = results.find((r) => r.operation === "commit" && r.success)?.output;

      if (commitSuccess) {
        const hashMatch = commitOutput?.match(/\[[\w\/]+\s+([a-f0-9]+)\]/);
        commit.setCommitHash(hashMatch?.[1] ?? null);
      }
      if (failed.length > 0) {
        commit.setCommitError(failed.map((r) => r.warning || r.summary).filter(Boolean).join("\n"));
      }
      setStatus(failed.length === 0 ? t("status.commitComplete") : t("status.commitStepsFailed", { count: failed.length }));
      if (commitSuccess) {
        commit.commitMessageRef.current = "";
        if (pushFailed) showToast(t("status.pushFailedToast"), "error");
        else showToast(t("status.commitSuccessToast"), "success");
      }
      setCommitResults(results);
      setCommitCompleted(true);
      // Auto-close after showing results briefly
      setTimeout(() => {
        setCommitProgressOpen(false);
        setCommitProgressLines([]);
        setCommitCompleted(false);
      }, 2000);
      await statusHook.loadRepositoryStatus(true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      commit.setCommitError(msg);
      setStatus(msg);
      setCommitProgressOpen(false);
    } finally {
      unlisten?.();
      commit.setIsCommitLoading(false);
    }
  }

  async function handleStageAll() {
    if (!repo.selectedRepository) return;
    try {
      setIsLoading(true);
      const result = await stageAllFiles(repo.selectedRepository.id);
      statusHook.setOperationResults([result]);
      setStatus(result.summary);
      await statusHook.loadRepositoryStatus(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUnstageAll() {
    if (!repo.selectedRepository) return;
    try {
      setIsLoading(true);
      const result = await unstageAllFiles(repo.selectedRepository.id);
      statusHook.setOperationResults([result]);
      setStatus(result.summary);
      await statusHook.loadRepositoryStatus(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUnstageFile(path: string) {
    if (!repo.selectedRepository) return;
    try {
      const result = await unstageFile(repo.selectedRepository.id, path);
      statusHook.setOperationResults([result]);
      setStatus(result.summary);
      await statusHook.loadRepositoryStatus(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function handleCommitStaged() {
    if (!repo.selectedRepository) return;
    commit.setIsCommitDialogOpen(true);
  }

  async function handleStartupContext() {
    try {
      const context = await consumeStartupContext();
      if (!context) return;

      repo.setPath(context.path);
      setIsLoading(true);
      const repository = await addRepository({ path: context.path });
      await repo.refreshRepositories();
      repo.setSelectedId(repository.id);

      if (visibleSections.repositories) {
        toggleSection("repositories");
      }

      if (context.action === "commit") {
        const nextStatus = await getRepositoryStatus(repository.id);
        statusHook.setRepositoryStatus(nextStatus);
        commit.syncKeys(nextStatus.changes);
        setActiveSidebarTab("changes");
        setTimeout(() => commit.setIsCommitDialogOpen(true), 100);
        setStatus(t("status.enteredCommitFromContextMenu"));
      } else {
        showToast(t("status.repoOpenedToast", { name: repository.name }), "info");
        setStatus(t("status.openedFromContextMenu", { name: repository.name }));
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      showToast(msg, "error");
      setStatus(msg);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRefreshWindowsContextMenu(showResult = true) {
    setIsWindowsContextMenuLoading(true);
    try {
      const nextStatus = await getWindowsContextMenuStatus();
      setWindowsContextMenuStatus(nextStatus);
      if (showResult) {
        setStatus(nextStatus.installed ? t("status.contextMenuInstalled") : t("status.contextMenuNotInstalled"));
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsWindowsContextMenuLoading(false);
    }
  }

  async function handleInstallWindowsContextMenu() {
    setIsWindowsContextMenuLoading(true);
    try {
      const nextStatus = await installWindowsContextMenu();
      setWindowsContextMenuStatus(nextStatus);
      setStatus(nextStatus.installed ? t("status.contextMenuInstalledToast") : t("status.contextMenuNotInstalled"));
      showToast(t("status.contextMenuInstalledToast"), "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message);
      showToast(message, "error");
    } finally {
      setIsWindowsContextMenuLoading(false);
    }
  }

  async function handleUninstallWindowsContextMenu() {
    setIsWindowsContextMenuLoading(true);
    try {
      const nextStatus = await uninstallWindowsContextMenu();
      setWindowsContextMenuStatus(nextStatus);
      setStatus(t("status.contextMenuRemoved"));
      showToast(t("status.contextMenuRemovedToast"), "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message);
      showToast(message, "error");
    } finally {
      setIsWindowsContextMenuLoading(false);
    }
  }

  const [remoteUpdateStatus, setRemoteUpdateStatus] = useState<RemoteUpdateStatus | null>(null);

  const handleChangeRowContextMenu = useCallback((
    event: MouseEvent<HTMLButtonElement>,
    path: string,
    vcsType: VcsType,
    status?: ChangeStatus,
  ) => {
    event.preventDefault();
    ignoreContextMenu.open({ path, vcsType, status }, event.clientX, event.clientY);
  }, [ignoreContextMenu]);

  function handleOpenDiffFromContextMenu(path: string, vcsType: VcsType, status?: ChangeStatus) {
    const file = changedFiles.find((f) => f.path === path && f.vcsType === vcsType);
    const resolvedStatus = status ?? file?.status;
    if (!resolvedStatus) {
      setStatus(t("status.noDiffInfo"));
      return;
    }

    void changeTree.handleOpenChangeDiff(path, { status: resolvedStatus, vcsType, staged: file?.staged ?? false });
    ignoreContextMenu.close();
  }

  const currentChangeCount = statusHook.repositoryStatus?.summary.total ?? 0;
  const currentReviewState = statusHook.repositoryStatus
    ? statusHook.repositoryStatus.clean
      ? t("review.reviewStateClean")
      : t("review.reviewStatePending")
    : t("review.reviewStateWaiting");
  const breadcrumbs = fileBreadcrumbs(fileTree.repositoryFiles?.path ?? "");
  const changeTreeData = useMemo(() => buildChangeTree(changedFiles), [changedFiles]);
  const changeTreeWithRoot = useMemo((): ChangeTreeNode[] =>
    repo.selectedRepository && changeTreeData.length > 0
      ? [{ name: repo.selectedRepository.name, path: "", children: changeTreeData }]
      : changeTreeData
  , [changeTreeData, repo.selectedRepository]);
  const fileTreeNodes = useMemo(() => fileTree.repositoryFiles ? toFileTreeNodes(fileTree.repositoryFiles.entries) : [], [fileTree.repositoryFiles]);
  const fileEntryMap = useMemo(() => fileTree.repositoryFiles ? buildFileEntryMap(fileTree.repositoryFiles.entries) : new Map(), [fileTree.repositoryFiles]);
  const changeTreeViewNodes = useMemo(() => changeTreeToViewNodes(changeTreeWithRoot), [changeTreeWithRoot]);
  const changeNodeMap = useMemo(() => buildChangeNodeMap(changeTreeWithRoot), [changeTreeWithRoot]);
  const handleFileTreeToggle = useCallback((path: string) => {
    const entry = fileEntryMap.get(path);
    if (entry) {
      void fileTree.handleExpandFileEntry(entry);
    }
  }, [fileEntryMap, fileTree]);
  const handleFileTreeOpen = useCallback((path: string) => {
    const entry = fileEntryMap.get(path);
    if (entry) {
      void fileTree.handleSelectFileEntry(entry);
    }
  }, [fileEntryMap, fileTree]);

  const handleOpenChangeDiff = useCallback((path: string, ch: { status: ChangeStatus; vcsType: VcsType; staged: boolean }) => {
    void changeTree.handleOpenChangeDiff(path, ch);
  }, [changeTree]);

  const onStageAllCb = useCallback(() => void handleStageAll(), [repo, statusHook]);
  const onUnstageAllCb = useCallback(() => void handleUnstageAll(), [repo, statusHook]);
  const onCommitStagedCb = useCallback(() => handleCommitStaged(), [repo, commit]);
  const onUnstageFileCb = useCallback((path: string) => void handleUnstageFile(path), [repo, statusHook]);

  useEffect(() => {
    if (!repo.selectedRepository || !visibleSections.files) return;
    void fileTree.handleLoadRepositoryFiles("");
  }, [repo.selectedRepository?.id, visibleSections.files]);

  const renderFileRow = useCallback((node: TreeViewNode, _level: number, _isExpanded: boolean) => {
    const entry = fileEntryMap.get(node.path);
    const isDirectory = node.isDirectory ?? node.children.length > 0;
    return (
      <>
        {isDirectory ? (
          <svg className="tree-folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
        ) : (
          <svg className="tree-file-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
          </svg>
        )}
        <strong>{node.name}</strong>
        <span>{isDirectory ? t("ui.folder") : entry ? formatFileSize(entry.size) : "-"}</span>
        <time>{entry ? formatModifiedAt(entry.modifiedAt) : "-"}</time>
      </>
    );
  }, [fileEntryMap, t]);

  const renderChangeRow = useCallback((node: TreeViewNode, _level: number, _isExpanded: boolean) => {
    const changeNode = changeNodeMap.get(node.path);
    const isDirectory = node.isDirectory ?? node.children.length > 0;
    return (
      <>
        {isDirectory ? (
          <svg className="tree-folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
        ) : (
          <svg className="tree-file-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
          </svg>
        )}
        <strong>{node.name}</strong>
        {changeNode?.change || changeNode?.derivedChange ? (
          <>
            <ChangeBadge status={(changeNode.change ?? changeNode.derivedChange)!.status} t={t} isDir={!changeNode.change && !!changeNode.derivedChange} />
            <small>{getVcsLabels(t)[(changeNode.change ?? changeNode.derivedChange)!.vcsType]}</small>
          </>
        ) : (
          <span className="tree-dir-count">{node.children.length}</span>
        )}
      </>
    );
  }, [changeNodeMap, t]);

  const shortcuts = useMemo(() => [
    { key: "r", ctrl: true, action: () => statusHook.handleLoadRepositoryStatus(), enabled: !!repo.selectedRepository },
    { key: "F", ctrl: true, shift: true, action: () => toggleSection("files") },
    { key: "D", ctrl: true, shift: true, action: () => {
      if (!visibleSections.review) toggleSection("review");
      setActiveSidebarTab("changes");
    }},
  ], [repo.selectedRepository, visibleSections.review, toggleSection]);
  useKeyboardShortcuts(shortcuts);

  const appShellClassName = `app-shell ${visibleSections.repositories ? "" : "repositories-collapsed"}`;

  // Startup loading screen — shown until first data load completes
  if (!hasInitialized && isLoading) {
    return (
      <div className="startup-loader">
        <div className="startup-loader-content">
          <div className="startup-loader-logo">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect width="48" height="48" rx="12" fill="var(--accent)" />
              <text x="24" y="32" textAnchor="middle" fill="white" fontSize="22" fontWeight="800" fontFamily="system-ui, sans-serif">G</text>
            </svg>
          </div>
          <div className="startup-loader-spinner" />
          <p className="startup-loader-status">{status}</p>
        </div>
      </div>
    );
  }

  return (
    <main className={appShellClassName}>
      <ActivityRail
        visibleSections={visibleSections}
        toggleSection={toggleSection}
        isLoading={isLoading}
        t={t}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenThemeSettings={() => setIsThemeOpen(true)}
      />

      <div className="sidebar-panels">
        {visibleSections.repositories ? (
          <ExplorerPane
            path={repo.path}
            onPathChange={repo.setPath}
            isLoading={isLoading}
            repositories={repo.repositories}
            selectedRepository={repo.selectedRepository}
            onSelectRepository={repo.setSelectedId}
            onRepositoriesChanged={repo.refreshRepositories}
            onDeleteRepository={(r) => {
              repo.setSelectedId(r.id);
              repo.setRepositoryPendingDelete(r);
            }}
            onRefreshRepositories={repo.refreshRepositories}
            onDropPath={(droppedPath) => {
              repo.setPath(droppedPath);
              showToast(t("status.pathRecognized", { path: droppedPath }), "info");
            }}
            onSetStatus={setStatus}
            isCloningActive={isCloning}
            t={t}
            onCloneRepository={async (url: string, targetPath: string, shallow: boolean, ignoreExternals: boolean) => {
              setIsCloning(true);
              setCloneDismissed(false);
              setCloneLines([]);
              setClonePct(null);
              setCloneStats(null);
              let unlistenLine: (() => void) | null = null;
              let unlistenPct: (() => void) | null = null;
              let unlistenStats: (() => void) | null = null;
              let unlistenReady: (() => void) | null = null;
              if (isTauriRuntime()) {
                try {
                  const { listen } = await import("@tauri-apps/api/event");
                  unlistenLine = await listen<string>("clone-progress-line", (e) => {
                    setCloneLines((prev) => [...prev, e.payload]);
                  });
                  unlistenPct = await listen<number>("clone-progress-pct", (e) => {
                    setClonePct(e.payload);
                  });
                  unlistenStats = await listen<{ files: number; sizeMb?: number; speedKbps?: number }>("clone-progress-stats", (e) => {
                    setCloneStats(e.payload);
                  });
                  // Refresh repo list when .svn is created (before full checkout completes)
                  unlistenReady = await listen<string>("clone-repo-ready", () => {
                    void repo.refreshRepositories();
                  });
                } catch { /* ignore */ }
              }
              try {
                await cloneRepository({ url, path: targetPath, shallow, ignoreExternals });
                showToast(t("status.cloneComplete"), "success");
                setStatus(t("status.cloneComplete"));
                return true;
              } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                showToast(msg, "error");
                setStatus(msg);
                return false;
              } finally {
                unlistenLine?.();
                unlistenPct?.();
                unlistenStats?.();
                unlistenReady?.();
                setIsCloning(false);
              }
            }}
            latestSvnRevisions={latestSvnRevisions}
          />
        ) : null}
      </div>

      <section className="workspace">
        <CommandBar
          selectedRepository={repo.selectedRepository}
          currentChangeCount={currentChangeCount}
          currentReviewState={currentReviewState}
          isLoading={isLoading}
          isIgnoreLoading={ignore.isIgnoreLoading}
          canOpenCommitDialog={commit.canOpenCommitDialog}
          isCommitLoading={commit.isCommitLoading}
          t={t}
          latestSvnRevisions={latestSvnRevisions}
          onRefreshSelected={repo.handleRefreshSelected}
          onLoadRepositoryStatus={statusHook.handleLoadRepositoryStatus}
          onUpdateRepository={async () => {
            const r = repo.selectedRepository;
            if (!r?.pathExists) return;
            const repoId = r.id;
            updateProgress.startUpdate(repoId, false);
            let unlisten: (() => void) | null = null;
            if (isTauriRuntime()) {
              try {
                const { listen } = await import("@tauri-apps/api/event");
                const u = await listen<string>("svn-update-line", (e) => {
                  updateProgress.addLine(repoId, e.payload);
                });
                unlisten = u;
              } catch { /* ignore */ }
            }
            updateProgress.registerCleanup(repoId, () => unlisten?.());
            try {
              await statusHook.handleUpdateRepository(settings.svnDepth);
            } finally {
              updateProgress.finishUpdate(repoId);
            }
          }}
          onForceUpdateRepository={async () => {
            const r = repo.selectedRepository;
            if (!r?.pathExists) return;
            const repoId = r.id;
            updateProgress.startUpdate(repoId, false);
            let unlisten: (() => void) | null = null;
            if (isTauriRuntime()) {
              try {
                const { listen } = await import("@tauri-apps/api/event");
                const u = await listen<string>("svn-update-line", (e) => {
                  updateProgress.addLine(repoId, e.payload);
                });
                unlisten = u;
              } catch { /* ignore */ }
            }
            updateProgress.registerCleanup(repoId, () => unlisten?.());
            try {
              const result = await forceUpdateRepository(repoId, settings.svnDepth);
              statusHook.setOperationResults([result]);
              operationHistory.addEntry([result]);
              setStatus(result.summary);
              if (!result.success && result.operation !== "push") {
                showOperationFailure([result]);
              }
              await statusHook.loadRepositoryStatus(true);
            } finally {
              updateProgress.finishUpdate(repoId);
            }
          }}
          onOpenIgnoreDialog={ignore.handleOpenIgnoreDialog}
          onOpenCommitDialog={() => commit.setIsCommitDialogOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onSwitchBranch={() => setIsBranchSwitcherOpen(true)}
          onOperationResult={(result) => {
            statusHook.setOperationResults([result]);
            operationHistory.addEntry([result]);
            setStatus(result.summary);
            if (!result.success && result.operation !== "push") {
              showOperationFailure([result]);
            }
          }}
          onStashChanged={() => statusHook.loadRepositoryStatus(true)}
        />

        {remoteBehind ? (
          <div className="remote-behind-bar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
            <span className="remote-behind-text">{remoteBehind.details ?? t("notification.remoteUpdateAvailable")}</span>
            <button type="button" className="remote-behind-update-btn" onClick={async () => {
              const r = repo.selectedRepository;
              if (!r) return;
              setRemoteBehind(null);
              const repoId = r.id;
              updateProgress.startUpdate(repoId, false);
              let unlisten: (() => void) | null = null;
              if (isTauriRuntime()) {
                try {
                  const { listen } = await import("@tauri-apps/api/event");
                  const u = await listen<string>("svn-update-line", (e) => {
                    updateProgress.addLine(repoId, e.payload);
                  });
                  unlisten = u;
                } catch { /* ignore */ }
              }
              try {
                const results = await updateRepository(repoId);
                updateProgress.finishUpdate(repoId);
                statusHook.setOperationResults(results);
                operationHistory.addEntry(results);
                statusHook.loadRepositoryStatus(true);
              } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                updateProgress.finishUpdate(repoId);
                setStatus(msg);
              } finally {
                unlisten?.();
              }
            }}>{t("notification.update")}</button>
            <button type="button" className="remote-behind-dismiss-btn" onClick={() => setRemoteBehind(null)} title={t("commit.cancel")}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        ) : null}

        <div className="workbench">
          <section className="main-thread">
            {Object.keys(updateProgress.progressMap).length > 0 ? (
              <div className="workspace-progress-bar">
                {Object.entries(updateProgress.progressMap).map(([repoIdStr, state]) => {
                  const repoId = Number(repoIdStr);
                  const repoName = repo.repositories.find((r) => r.id === repoId)?.name ?? `#${repoId}`;
                  return (
                    <button
                      key={repoId}
                      className={`workspace-progress-chip ${expandedProgressRepo === repoId ? "active" : ""}`}
                      type="button"
                      onClick={() => setExpandedProgressRepo(expandedProgressRepo === repoId ? null : repoId)}
                    >
                      <span className="workspace-progress-spinner" />
                      <span>{repoName}</span>
                      <span className="workspace-progress-count">{state.lines.length}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {cardOrder.order.map((cardId, index) => {
              const isDragging = cardOrder.dragId === cardId;
              const isDropTarget = cardOrder.dropIndex === index;

              const content = (() => {
                switch (cardId) {
                  case "repo-summary":
                    return (
                      <RepositorySummaryPanel
                        selectedRepository={repo.selectedRepository}
                        currentReviewState={currentReviewState}
                        currentChangeCount={currentChangeCount}
                        t={t}
                        onLatestSvnRevision={handleLatestSvnRevision}
                      />
                    );
                  case "file-browser":
                    if (!visibleSections.files) return null;
                    return (
                      <FileBrowserPanel
                        repositoryFiles={fileTree.repositoryFiles}
                        selectedRepository={repo.selectedRepository}
                        isFileBrowserLoading={fileTree.isFileBrowserLoading}
                        t={t}
                        onLoadRepositoryFiles={fileTree.handleLoadRepositoryFiles}
                        breadcrumbs={breadcrumbs}
                        fileTreeNodes={fileTreeNodes}
                        expandedFilePaths={fileTree.expandedFilePaths}
                        isFilePreviewOpen={fileTree.isFilePreviewOpen}
                        selectedFilePreview={fileTree.selectedFilePreview}
                        isFilePreviewLoading={fileTree.isFilePreviewLoading}
                        renderFileRow={renderFileRow}
                        onFileTreeToggle={handleFileTreeToggle}
                        onFileTreeOpen={handleFileTreeOpen}
                        onCloseFilePreview={fileTree.closeFilePreview}
                        onContextMenu={handleChangeRowContextMenu}
                      />
                    );
                  case "status":
                    return (
                      <StatusPanel
                        repositoryStatus={statusHook.repositoryStatus}
                        selectedRepository={repo.selectedRepository}
                        t={t}
                        onOpenSvnDownload={statusHook.handleOpenSvnDownload}
                        onSelectChange={changeTree.selectChange}
                        onOpenChangeDiff={(path, ch) => void changeTree.handleOpenChangeDiff(path, ch)}
                        onContextMenu={handleChangeRowContextMenu}
                      />
                    );
                  case "operation":
                    return (
                      <OperationPanel
                        operationResults={statusHook.operationResults}
                        persistedLogs={operationHistory.persistedLogs}
                        t={t}
                        onOpenSvnDownload={statusHook.handleOpenSvnDownload}
                        onClearHistory={operationHistory.clearHistory}
                        onRetryPush={async () => {
                          if (!repo.selectedRepository) return;
                          try {
                            const result = await retryPush(repo.selectedRepository.id);
                            statusHook.setOperationResults([result]);
                            if (result.success) {
                              showToast(t("status.pushRetrySuccess"), "success");
                              setStatus(t("status.pushRetrySuccess"));
                            } else {
                              showToast(t("status.pushRetryFailed"), "error");
                              setStatus(t("status.pushRetryFailed"));
                            }
                          } catch (error) {
                            const msg = error instanceof Error ? error.message : String(error);
                            showToast(msg, "error");
                            setStatus(msg);
                          }
                        }}
                      />
                    );
                  default:
                    return null;
                }
              })();

              if (!content) return null;

              return (
                <DraggableCard
                  key={cardId}
                  cardId={cardId}
                  index={index}
                  isDragging={isDragging}
                  isDropTarget={isDropTarget}
                  registerCardRef={cardOrder.registerCardRef}
                  onMouseDown={cardOrder.handleMouseDown}
                  t={t}
                >
                  {content}
                </DraggableCard>
              );
            })}
          </section>

          <TabPanel
            activeTab={activeSidebarTab}
            onActiveTabChange={setActiveSidebarTab}
            tabs={[
              {
                key: "changes",
                label: t("changes.title"),
                visible: visibleSections.changes,
                content: (
                  <ChangesPane
                    changedFiles={changedFiles}
                    changeTreeViewNodes={changeTreeViewNodes}
                    expandedChangePaths={changeTree.expandedChangePaths}
                    t={t}
                    renderChangeRow={renderChangeRow}
                    onToggleChangeNode={changeTree.toggleChangeNode}
                    changeNodeMap={changeNodeMap}
                    selectedChange={changeTree.selectedChange}
                    onSelectChange={changeTree.selectChange}
                    onOpenChangeDiff={handleOpenChangeDiff}
                    onContextMenu={handleChangeRowContextMenu}
                    repositoryStatus={statusHook.repositoryStatus}
                    defaultViewMode={settings.defaultViewMode}
                    onStageAll={repo.selectedRepository?.vcsType !== "svn" ? onStageAllCb : undefined}
                    onUnstageAll={repo.selectedRepository?.vcsType !== "svn" ? onUnstageAllCb : undefined}
                    onCommitStaged={onCommitStagedCb}
                    onUnstageFile={onUnstageFileCb}
                  />
                ),
              },
              {
                key: "review",
                label: t("review.reviewQuality"),
                visible: visibleSections.review,
                content: (
                  <ReviewPane
                    selectedRepository={repo.selectedRepository}
                    t={t}
                  />
                ),
              },
            ]}
          />
        </div>

        <StatusBar isLoading={isLoading} status={status} />
      </section>

      <Modal
        open={changeTree.isDiffDialogOpen}
        onClose={changeTree.closeDiffDialog}
        labelledBy="diff-preview-title"
        className="diff-dialog"
      >
        <ModalHeading
          eyebrow={t("diff.view")}
          title={changeTree.selectedChange?.path ?? t("review.reviewStatePending")}
          titleId="diff-preview-title"
          onClose={changeTree.closeDiffDialog}
          t={t}
        />
        <section className="diff-panel diff-dialog-body">
          {changeTree.selectedChange ? (
            <div className="panel-title-row">
              <div className="diff-panel-heading">
                <ChangeBadge status={changeTree.selectedChange.status} t={t} />
                <strong title={changeTree.selectedChange.path}>{changeTree.selectedChange.path}</strong>
                <span className="soft-chip">{getVcsLabels(t)[changeTree.selectedChange.vcsType]}</span>
              </div>
            </div>
          ) : null}
          {changeTree.diffPreview?.warning ? <p className="diff-warning">{changeTree.diffPreview.warning}</p> : null}
          <DiffCodeBlock
            content={
              changeTree.isDiffLoading
                ? t("diff.loading")
                : changeTree.diffPreview?.content || t("diff.empty")
            }
            path={changeTree.selectedChange?.path}
          />
        </section>
      </Modal>

      <IgnoreContextMenuOverlay
        menu={ignoreContextMenu.menu}
        repositoryId={repo.selectedRepository?.id}
        t={t}
        onOpenDiff={handleOpenDiffFromContextMenu}
        onIgnoreFile={(path, vcsType) => ignore.handleAddIgnoreRule(path, vcsType)}
        onClose={ignoreContextMenu.close}
        onOperationResult={(result) => {
          statusHook.setOperationResults([result]);
          operationHistory.addEntry([result]);
          setStatus(result.summary);
          statusHook.loadRepositoryStatus(true);
        }}
      />

      <DeleteConfirmDialog
        repository={repo.repositoryPendingDelete}
        isLoading={isLoading}
        t={t}
        onClose={() => repo.setRepositoryPendingDelete(null)}
        onConfirm={async () => {
          const deletedId = repo.repositoryPendingDelete?.id;
          await repo.handleDeleteRepositoryRecord();
          if (deletedId != null) {
            setLatestSvnRevisions((prev) => {
              if (!(deletedId in prev)) return prev;
              const next = { ...prev };
              delete next[deletedId];
              return next;
            });
          }
        }}
      />

      <IgnoreDialog
        open={ignore.isIgnoreDialogOpen}
        onClose={() => ignore.setIsIgnoreDialogOpen(false)}
        ignoreRules={ignore.ignoreRules}
        isIgnoreLoading={ignore.isIgnoreLoading}
        t={t}
        onSaveGitignore={ignore.handleSaveGitignore}
        onSaveSvnIgnore={ignore.handleSaveSvnIgnore}
        onGitignoreContentChange={(content) =>
          ignore.setIgnoreRules((current) =>
            current ? { ...current, gitignoreContent: content } : current,
          )
        }
        onSvnignoreContentChange={(content) =>
          ignore.setIgnoreRules((current) =>
            current ? { ...current, svnignoreContent: content } : current,
          )
        }
        onRemoveSkipWorktree={(path) => ignore.handleRemoveIgnoreRule(path, "git")}
      />

      <CommitDialog
        open={commit.isCommitDialogOpen}
        onClose={handleCommitDialogClose}
        t={t}
        repositoryId={repo.selectedRepository?.id ?? null}
        committableFiles={commit.committableFiles}
        selectedCommitKeys={commit.selectedCommitKeys}
        selectedCommitCount={commit.selectedCommitCount}
        selectedVcsCounts={commit.selectedVcsCounts}
        hasGitCommitSelection={commit.hasGitCommitSelection}
        pushAfterCommit={commit.pushAfterCommit}
        isCommitLoading={commit.isCommitLoading}
        vcsLabels={vcsLabels}
        commitMessageRef={commit.commitMessageRef}
        commitError={commit.commitError}
        commitHash={commit.commitHash}
        commitResults={commitResults}
        onToggleAllFiles={commit.toggleAllCommitFiles}
        onToggleFile={commit.toggleCommitFile}
        onPushToggle={commit.setPushAfterCommit}
        onSubmit={handleCommitRepository}
        onDismissResults={() => setCommitResults(null)}
        onOpenFileDiff={(path, vcsType, status) => {
          const file = changedFiles.find((f) => f.path === path && f.vcsType === vcsType);
          changeTree.handleOpenChangeDiff(path, { status: status as ChangeStatus, vcsType, staged: file?.staged ?? false });
        }}
      />

      <BranchSwitcher
        open={isBranchSwitcherOpen}
        onClose={() => setIsBranchSwitcherOpen(false)}
        repository={repo.selectedRepository}
        t={t}
        onSwitched={(summary) => setStatus(summary)}
      />

      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <SettingsDialog
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        t={t}
        windowsContextMenuStatus={windowsContextMenuStatus}
        isWindowsContextMenuLoading={isWindowsContextMenuLoading}
        onInstallWindowsContextMenu={handleInstallWindowsContextMenu}
        onUninstallWindowsContextMenu={handleUninstallWindowsContextMenu}
        onRefreshWindowsContextMenu={() => void handleRefreshWindowsContextMenu(true)}
        onUpdateSettings={updateSettings}
      />

      <ThemeDialog
        open={isThemeOpen}
        onClose={() => setIsThemeOpen(false)}
        t={t}
        settings={settings}
        onUpdateSettings={updateSettings}
      />

      <OperationDetailModal
        data={failureDetail}
        open={failureDetailOpen}
        onClose={() => setFailureDetailOpen(false)}
        t={t}
      />

      <UpdateProgressDialog
        open={isCloning && !cloneDismissed}
        onClose={() => setCloneDismissed(true)}
        lines={cloneLines}
        title={t("update.remoteClone")}
        onCancel={() => { cancelOperation(); setIsCloning(false); setCloneDismissed(false); }}
        progress={clonePct}
        stats={cloneStats}
        t={t}
        preventBackdropClose={true}
      />

      {isCloning && cloneDismissed ? (
        <button className="floating-progress-indicator" onClick={() => setCloneDismissed(false)} title={t("update.clickToReopen")}>
          <span className="floating-progress-spinner" />
          <span>{t("update.remoteClone")}</span>
        </button>
      ) : null}

      {expandedProgressRepo !== null && updateProgress.progressMap[expandedProgressRepo] ? (
        (() => {
          const state = updateProgress.progressMap[expandedProgressRepo];
          const repoName = repo.repositories.find((r) => r.id === expandedProgressRepo)?.name ?? `#${expandedProgressRepo}`;
          return (
            <UpdateProgressDialog
              open={true}
              onClose={() => setExpandedProgressRepo(null)}
              lines={state.lines}
              title={repoName}
              onCancel={() => { cancelOperation(); updateProgress.finishUpdate(expandedProgressRepo); setExpandedProgressRepo(null); }}
              progress={state.progress}
              stats={state.stats}
              t={t}
              preventBackdropClose={false}
              startedAt={state.startedAt}
            />
          );
        })()
      ) : null}

      <UpdateProgressDialog
        open={commitProgressOpen && !commitDismissed}
        onClose={() => setCommitDismissed(true)}
        lines={commitProgressLines}
        title={t("command.commit")}
        t={t}
        preventBackdropClose={false}
        completed={commitCompleted}
      />

      {commitProgressOpen && commitDismissed ? (
        <button className="floating-progress-indicator" onClick={() => setCommitDismissed(false)} title={t("update.clickToReopen")}>
          <span className="floating-progress-spinner" />
          <span>{t("command.commit")}</span>
        </button>
      ) : null}

      <UpdateNotificationPanel
        repositories={repo.repositories}
        settings={settings}
        onUpdateCompleted={() => statusHook.loadRepositoryStatus(true)}
        t={t}
      />
    </main>
  );
}

function App() {
  const [status, setStatus] = useState("正在启动...");
  const [isLoading, setIsLoading] = useState(true);

  return (
    <WorkspaceProvider isLoading={isLoading} setIsLoading={setIsLoading} status={status} setStatus={setStatus}>
      <AppContent />
    </WorkspaceProvider>
  );
}

export default App;