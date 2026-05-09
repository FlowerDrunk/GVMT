import { FormEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import fileIconUrl from "../src-tauri/icons/file.png";
import folderIconUrl from "../src-tauri/icons/folder.png";
import { changeKey, VcsLabels } from "./lib/constants";
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
  type RemoteUpdateStatus,
  type WindowsContextMenuStatus,
  uninstallWindowsContextMenu,
  updateRepository,
  type ChangeStatus,
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
import { useQualityChecks } from "./hooks/useQualityChecks";
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
import { OperationPanel } from "./components/workspace/OperationPanel";
import { BranchSwitcher } from "./components/workspace/BranchSwitcher";
import { StatusBar, IgnoreContextMenuOverlay } from "./components/workspace/StatusBar";
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
  const [status, setStatus] = useState("正在启动...");
  const startupContextHandledRef = useRef(false);

  const { visibleSections, toggleSection } = useVisibleSections();
  const ignoreContextMenu = useContextMenu<{ path: string; vcsType: VcsType; status?: ChangeStatus }>();

  const repo = useRepositories({ setStatus, setIsLoading });

  // Track initial load completion
  useEffect(() => {
    if (!isLoading && !hasInitialized && repo.repositories.length >= 0) {
      setHasInitialized(true);
      if (repo.repositories.length === 0) {
        setStatus("准备就绪 — 请添加仓库");
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
  });

  const changedFiles = statusHook.repositoryStatus?.changes ?? [];
  const commit = useCommit({ selectedRepository: repo.selectedRepository, changedFiles });

  statusHook.syncKeysRef.current = commit.syncKeys;

  const fileTree = useFileTree({ selectedRepository: repo.selectedRepository, setStatus });
  const changeTree = useChangeTree({ selectedRepository: repo.selectedRepository, setStatus });
  const qualityChecks = useQualityChecks({
    selectedRepository: repo.selectedRepository,
    setStatus,
    showToast,
  });

  const ignore = useIgnoreRules({
    selectedRepository: repo.selectedRepository,
    loadRepositoryStatus: statusHook.loadRepositoryStatus,
    setOperationResults: statusHook.setOperationResults,
    onCloseContextMenu: ignoreContextMenu.close,
    setStatus,
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
    statusHook.reset();
    fileTree.reset();
    changeTree.reset();
    commit.resetCommitState();
    repo.setRepositoryPendingDelete(null);
    ignore.reset();
    ignoreContextMenu.close();
  }, [repo.selectedRepository?.id]);

  async function handleCommitRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!repo.selectedRepository) {
      setStatus("请先选择一个仓库");
      return;
    }

    const selectedFiles = commit.committableFiles.filter(
      (change) => commit.selectedCommitKeys.has(changeKey(change)),
    );
    if (selectedFiles.length === 0) {
      setStatus("请选择需要提交的文件");
      return;
    }
    if (!commit.commitMessage.trim()) {
      setStatus("请输入提交信息");
      return;
    }

    commit.setIsCommitLoading(true);
    try {
      const results = await commitRepository(repo.selectedRepository.id, {
        message: commit.commitMessage,
        push: commit.pushAfterCommit,
        files: selectedFiles,
      });
      statusHook.setOperationResults(results);
      operationHistory.addEntry(results);
      const failed = results.filter((result) => !result.success);
      const commitSuccess = results.some((r) => r.operation === "commit" && r.success);
      const pushFailed = results.some((r) => r.operation === "push" && !r.success);
      setStatus(failed.length === 0 ? "提交完成" : `${failed.length} 个提交步骤失败`);
      // 只要本地提交成功就关闭弹窗 — push 失败不阻塞后续操作
      if (commitSuccess) {
        commit.setCommitMessage("");
        commit.setIsCommitDialogOpen(false);
        if (pushFailed) {
          showToast("本地提交成功，但 Push 失败，请点击重试按钮", "error");
        } else {
          showToast("提交完成", "success");
        }
      }
      await statusHook.loadRepositoryStatus(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      commit.setIsCommitLoading(false);
    }
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
        setStatus("已从右键菜单进入提交流程");
      } else {
        showToast(`已打开 ${repository.name}`, "info");
        setStatus(`已从右键菜单打开 ${repository.name}`);
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
        setStatus(nextStatus.installed ? "Windows 右键菜单已安装" : "Windows 右键菜单未安装");
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
      setStatus(nextStatus.installed ? "已安装 Windows 右键菜单" : "Windows 右键菜单安装状态未知");
      showToast("已安装 Windows 右键菜单", "success");
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
      setStatus("已移除 Windows 右键菜单");
      showToast("已移除 Windows 右键菜单", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message);
      showToast(message, "error");
    } finally {
      setIsWindowsContextMenuLoading(false);
    }
  }

  const [remoteUpdateStatus, setRemoteUpdateStatus] = useState<RemoteUpdateStatus | null>(null);

  // Remote update detection: run periodically (every Nth auto-refresh cycle)
  const remoteCheckCountRef = useRef(0);
  useEffect(() => {
    if (!repo.selectedRepository || !settings.autoRefresh) return;
    remoteCheckCountRef.current = 0;

    const timer = setInterval(async () => {
      remoteCheckCountRef.current += 1;
      if (remoteCheckCountRef.current % 5 !== 0) return;
      try {
        const status = await checkRemoteUpdates(repo.selectedRepository!.id);
        setRemoteUpdateStatus(status);
        if (status.hasUpdates) {
          setStatus(status.details ?? "远端有更新可用");
          showToast(status.details ?? "远端有更新可用", "info");
        }
      } catch {
        // Remote check failed silently
      }
    }, settings.refreshIntervalMs * 5);

    return () => clearInterval(timer);
  }, [repo.selectedRepository?.id, settings.autoRefresh, settings.refreshIntervalMs]);

  function handleChangeRowContextMenu(
    event: MouseEvent<HTMLButtonElement>,
    path: string,
    vcsType: VcsType,
    status?: ChangeStatus,
  ) {
    event.preventDefault();
    ignoreContextMenu.open({ path, vcsType, status }, event.clientX, event.clientY);
  }

  function handleOpenDiffFromContextMenu(path: string, vcsType: VcsType, status?: ChangeStatus) {
    const resolvedStatus =
      status ?? changedFiles.find((file) => file.path === path && file.vcsType === vcsType)?.status;
    if (!resolvedStatus) {
      setStatus("未找到可查看的 diff 信息");
      return;
    }

    void changeTree.handleOpenChangeDiff(path, { status: resolvedStatus, vcsType });
    ignoreContextMenu.close();
  }

  const currentChangeCount = statusHook.repositoryStatus?.summary.total ?? 0;
  const currentReviewState = statusHook.repositoryStatus
    ? statusHook.repositoryStatus.clean
      ? "可进入评审"
      : "有待处理变更"
    : "等待检测";
  const breadcrumbs = fileBreadcrumbs(fileTree.repositoryFiles?.path ?? "");
  const changeTreeData = buildChangeTree(changedFiles);
  const changeTreeWithRoot: ChangeTreeNode[] =
    repo.selectedRepository && changeTreeData.length > 0
      ? [{ name: repo.selectedRepository.name, path: "", children: changeTreeData }]
      : changeTreeData;
  const fileTreeNodes = fileTree.repositoryFiles ? toFileTreeNodes(fileTree.repositoryFiles.entries) : [];
  const fileEntryMap = fileTree.repositoryFiles ? buildFileEntryMap(fileTree.repositoryFiles.entries) : new Map();
  const changeTreeViewNodes = changeTreeToViewNodes(changeTreeWithRoot);
  const changeNodeMap = buildChangeNodeMap(changeTreeWithRoot);
  const handleFileTreeToggle = (path: string) => {
    const entry = fileEntryMap.get(path);
    if (entry) {
      void fileTree.handleExpandFileEntry(entry);
    }
  };
  const handleFileTreeOpen = (path: string) => {
    const entry = fileEntryMap.get(path);
    if (entry) {
      void fileTree.handleSelectFileEntry(entry);
    }
  };

  useEffect(() => {
    if (!repo.selectedRepository || !visibleSections.files) return;
    void fileTree.handleLoadRepositoryFiles("");
  }, [repo.selectedRepository?.id, visibleSections.files]);

  const renderFileRow = (node: TreeViewNode, _level: number, _isExpanded: boolean) => {
    const entry = fileEntryMap.get(node.path);
    const isDirectory = node.isDirectory ?? node.children.length > 0;
    return (
      <>
        <img className="tree-icon" src={isDirectory ? folderIconUrl : fileIconUrl} alt="" aria-hidden="true" />
        <strong>{node.name}</strong>
        <span>{isDirectory ? "文件夹" : entry ? formatFileSize(entry.size) : "-"}</span>
        <time>{entry ? formatModifiedAt(entry.modifiedAt) : "-"}</time>
      </>
    );
  };

  const renderChangeRow = (node: TreeViewNode, _level: number, _isExpanded: boolean) => {
    const changeNode = changeNodeMap.get(node.path);
    const isDirectory = node.isDirectory ?? node.children.length > 0;
    return (
      <>
        <img className="tree-icon" src={isDirectory ? folderIconUrl : fileIconUrl} alt="" aria-hidden="true" />
        <strong>{node.name}</strong>
        {changeNode?.change ? (
          <>
            <ChangeBadge status={changeNode.change.status} />
            <small>{VcsLabels[changeNode.change.vcsType]}</small>
          </>
        ) : (
          <>
            <span>{node.children.length} 项</span>
            <small>目录</small>
          </>
        )}
      </>
    );
  };

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
              showToast(`已识别路径：${droppedPath}`, "info");
            }}
            onSetStatus={setStatus}
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
          onRefreshSelected={repo.handleRefreshSelected}
          onLoadRepositoryStatus={statusHook.handleLoadRepositoryStatus}
          onUpdateRepository={statusHook.handleUpdateRepository}
          onOpenIgnoreDialog={ignore.handleOpenIgnoreDialog}
          onOpenCommitDialog={() => commit.setIsCommitDialogOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onSwitchBranch={() => setIsBranchSwitcherOpen(true)}
        />

        <div className="workbench">
          <section className="main-thread">
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
                        isLoading={isLoading}
                        t={t}
                        onLoadRepositoryStatus={statusHook.handleLoadRepositoryStatus}
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
                        history={operationHistory.history}
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
                              showToast("Push 重试成功", "success");
                              setStatus("Push 重试成功");
                            } else {
                              showToast("Push 重试失败", "error");
                              setStatus("Push 重试失败");
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
                label: "变更状态",
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
                    onOpenChangeDiff={(path, ch) => void changeTree.handleOpenChangeDiff(path, ch)}
                    onContextMenu={handleChangeRowContextMenu}
                    repositoryStatus={statusHook.repositoryStatus}
                    repositoryStats={repo.repositoryStats}
                    defaultViewMode={settings.defaultViewMode}
                  />
                ),
              },
              {
                key: "review",
                label: "评审与质量",
                visible: visibleSections.review,
                content: (
                  <ReviewPane
                    selectedRepository={repo.selectedRepository}
                    currentReviewState={currentReviewState}
                    currentChangeCount={currentChangeCount}
                    repositoryStatus={statusHook.repositoryStatus}
                    t={t}
                    qualityChecks={qualityChecks.checks}
                    isQualityCheckLoading={qualityChecks.isLoadingTemplates}
                    onRunQualityCheck={(checkType) => void qualityChecks.runCheck(checkType)}
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
          eyebrow="Diff view"
          title={changeTree.selectedChange?.path ?? "变更详情"}
          titleId="diff-preview-title"
          onClose={changeTree.closeDiffDialog}
        />
        <section className="diff-panel diff-dialog-body">
          {changeTree.selectedChange ? (
            <div className="panel-title-row">
              <div className="diff-panel-heading">
                <ChangeBadge status={changeTree.selectedChange.status} />
                <strong title={changeTree.selectedChange.path}>{changeTree.selectedChange.path}</strong>
                <span className="soft-chip">{VcsLabels[changeTree.selectedChange.vcsType]}</span>
              </div>
            </div>
          ) : null}
          {changeTree.diffPreview?.warning ? <p className="diff-warning">{changeTree.diffPreview.warning}</p> : null}
          <DiffCodeBlock
            content={
              changeTree.isDiffLoading
                ? "正在加载 diff..."
                : changeTree.diffPreview?.content || "暂无 diff 内容"
            }
            path={changeTree.selectedChange?.path}
          />
        </section>
      </Modal>

      <IgnoreContextMenuOverlay
        menu={ignoreContextMenu.menu}
        t={t}
        onOpenDiff={handleOpenDiffFromContextMenu}
        onIgnoreFile={(path, vcsType) => ignore.handleAddIgnoreRule(path, vcsType)}
      />

      <DeleteConfirmDialog
        repository={repo.repositoryPendingDelete}
        isLoading={isLoading}
        t={t}
        onClose={() => repo.setRepositoryPendingDelete(null)}
        onConfirm={repo.handleDeleteRepositoryRecord}
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
        onSvnRulesChange={(directory, rules) =>
          ignore.setIgnoreRules((current) => {
            if (!current) return current;
            return {
              ...current,
              svnEntries: current.svnEntries.map((e) =>
                e.directory === directory ? { ...e, rules } : e,
              ),
            };
          })
        }
      />

      <CommitDialog
        open={commit.isCommitDialogOpen}
        onClose={() => commit.setIsCommitDialogOpen(false)}
        t={t}
        committableFiles={commit.committableFiles}
        selectedCommitKeys={commit.selectedCommitKeys}
        selectedCommitCount={commit.selectedCommitCount}
        hasGitCommitSelection={commit.hasGitCommitSelection}
        pushAfterCommit={commit.pushAfterCommit}
        commitMessage={commit.commitMessage}
        isCommitLoading={commit.isCommitLoading}
        latestQualityResult={qualityChecks.latestResult}
        vcsLabels={VcsLabels}
        onToggleAllFiles={commit.toggleAllCommitFiles}
        onToggleFile={commit.toggleCommitFile}
        onPushToggle={commit.setPushAfterCommit}
        onCommitMessageChange={commit.setCommitMessage}
        onSubmit={handleCommitRepository}
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