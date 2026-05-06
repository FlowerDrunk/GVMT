import { FormEvent, MouseEvent, useEffect, useState } from "react";
import fileIconUrl from "../src-tauri/icons/file.png";
import folderIconUrl from "../src-tauri/icons/folder.png";
import { changeKey, VcsLabels } from "./lib/constants";
import { useTheme } from "./lib/theme";
import {
  commitRepository,
  VcsType,
} from "./lib/api";
import {
  buildChangeNodeMap,
  buildChangeTree,
  buildFileEntryMap,
  changeTreeToViewNodes,
  ChangeTreeNode,
  diffLineClassName,
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
import { ActivityRail } from "./components/layout/ActivityRail";
import { CommandBar } from "./components/layout/CommandBar";
import { ExplorerPane } from "./components/panels/ExplorerPane";
import { FileBrowserPanel } from "./components/panels/FileBrowserPanel";
import { StatusPanel } from "./components/panels/StatusPanel";
import { ChangesPane } from "./components/panels/ChangesPane";
import { ReviewPane } from "./components/panels/ReviewPane";
import { OperationPanel } from "./components/workspace/OperationPanel";
import { StatusBar, IgnoreContextMenuOverlay } from "./components/workspace/StatusBar";
import { TabPanel } from "./components/shared/TabPanel";

function App() {
  const [status, setStatus] = useState("准备就绪");
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSidebarTab, setActiveSidebarTab] = useState<string>("changes");

  const { visibleSections, toggleSection } = useVisibleSections();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const { settings, updateSettings } = useSettings();
  const ignoreContextMenu = useContextMenu<{ path: string; vcsType: VcsType }>();

  const repo = useRepositories({ setStatus, setIsLoading });

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

  const ignore = useIgnoreRules({
    selectedRepository: repo.selectedRepository,
    loadRepositoryStatus: statusHook.loadRepositoryStatus,
    setOperationResults: statusHook.setOperationResults,
    onCloseContextMenu: ignoreContextMenu.close,
    setStatus,
  });

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
      const failed = results.filter((result) => !result.success);
      setStatus(failed.length === 0 ? "提交完成" : `${failed.length} 个提交步骤失败`);
      if (failed.length === 0) {
        commit.setCommitMessage("");
        commit.setIsCommitDialogOpen(false);
      }
      await statusHook.loadRepositoryStatus(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      commit.setIsCommitLoading(false);
    }
  }

  function handleChangeRowContextMenu(
    event: MouseEvent<HTMLButtonElement>,
    path: string,
    vcsType: VcsType,
  ) {
    event.preventDefault();
    ignoreContextMenu.open({ path, vcsType }, event.clientX, event.clientY);
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
  const handleFileTreeSelect = (path: string) => {
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

  const appShellClassName = `app-shell ${visibleSections.repositories ? "" : "repositories-collapsed"}`;

  return (
    <main className={appShellClassName}>
      <ActivityRail
        visibleSections={visibleSections}
        toggleSection={toggleSection}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        isLoading={isLoading}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {visibleSections.repositories ? (
        <ExplorerPane
          path={repo.path}
          onPathChange={repo.setPath}
          isLoading={isLoading}
          repositories={repo.repositories}
          selectedRepository={repo.selectedRepository}
          onSelectRepository={repo.setSelectedId}
          onAddRepository={repo.handleAddRepository}
          onDetect={repo.handleDetect}
          onDeleteRepository={(r) => {
            repo.setSelectedId(r.id);
            repo.setRepositoryPendingDelete(r);
          }}
          onRefreshRepositories={repo.refreshRepositories}
        />
      ) : null}

      <section className="workspace">
        <CommandBar
          selectedRepository={repo.selectedRepository}
          currentChangeCount={currentChangeCount}
          currentReviewState={currentReviewState}
          isLoading={isLoading}
          isIgnoreLoading={ignore.isIgnoreLoading}
          canOpenCommitDialog={commit.canOpenCommitDialog}
          isCommitLoading={commit.isCommitLoading}
          onRefreshSelected={repo.handleRefreshSelected}
          onLoadRepositoryStatus={statusHook.handleLoadRepositoryStatus}
          onUpdateRepository={statusHook.handleUpdateRepository}
          onOpenIgnoreDialog={ignore.handleOpenIgnoreDialog}
          onOpenCommitDialog={() => commit.setIsCommitDialogOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        <div className="workbench">
          <section className="main-thread">
            {visibleSections.files ? (
              <FileBrowserPanel
                repositoryFiles={fileTree.repositoryFiles}
                selectedRepository={repo.selectedRepository}
                isFileBrowserLoading={fileTree.isFileBrowserLoading}
                onLoadRepositoryFiles={fileTree.handleLoadRepositoryFiles}
                breadcrumbs={breadcrumbs}
                fileTreeNodes={fileTreeNodes}
                expandedFilePaths={fileTree.expandedFilePaths}
                selectedFilePreview={fileTree.selectedFilePreview}
                isFilePreviewLoading={fileTree.isFilePreviewLoading}
                renderFileRow={renderFileRow}
                onFileTreeToggle={handleFileTreeToggle}
                onFileTreeSelect={handleFileTreeSelect}
                onContextMenu={handleChangeRowContextMenu}
              />
            ) : null}

            {changeTree.selectedChange ? (
              <section className="panel diff-panel">
                <div className="panel-title-row">
                  <div className="diff-panel-heading">
                    <ChangeBadge status={changeTree.selectedChange.status} />
                    <strong title={changeTree.selectedChange.path}>{changeTree.selectedChange.path}</strong>
                    <span className="soft-chip">{VcsLabels[changeTree.selectedChange.vcsType]}</span>
                  </div>
                  <button className="icon-button" type="button" onClick={() => changeTree.reset()} title="关闭 diff">×</button>
                </div>
                {changeTree.diffPreview?.warning ? <p className="diff-warning">{changeTree.diffPreview.warning}</p> : null}
                <pre>
                  {changeTree.isDiffLoading
                    ? "正在加载 diff..."
                    : changeTree.diffPreview?.content
                      ? changeTree.diffPreview.content.split("\n").map((line: string, index: number) => (
                          <span className={diffLineClassName(line)} key={`${index}-${line.slice(0, 16)}`}>
                            {line || " "}
                          </span>
                        ))
                      : "暂无 diff 内容"}
                </pre>
              </section>
            ) : null}

            <StatusPanel
              repositoryStatus={statusHook.repositoryStatus}
              selectedRepository={repo.selectedRepository}
              isLoading={isLoading}
              onLoadRepositoryStatus={statusHook.handleLoadRepositoryStatus}
              onOpenSvnDownload={statusHook.handleOpenSvnDownload}
            />

            <OperationPanel
              operationResults={statusHook.operationResults}
              onOpenSvnDownload={statusHook.handleOpenSvnDownload}
            />
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
                    renderChangeRow={renderChangeRow}
                    onToggleChangeNode={changeTree.toggleChangeNode}
                    changeNodeMap={changeNodeMap}
                    selectedChange={changeTree.selectedChange}
                    onSelectChange={(path, ch) => void changeTree.handleSelectChange(path, ch)}
                    onContextMenu={handleChangeRowContextMenu}
                    repositoryStatus={statusHook.repositoryStatus}
                    repositoryStats={repo.repositoryStats}
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
                  />
                ),
              },
            ]}
          />
        </div>

        <StatusBar isLoading={isLoading} status={status} />
      </section>

      <IgnoreContextMenuOverlay
        menu={ignoreContextMenu.menu}
        onIgnoreFile={(path, vcsType) => ignore.handleAddIgnoreRule(path, vcsType as VcsType)}
      />

      <DeleteConfirmDialog
        repository={repo.repositoryPendingDelete}
        isLoading={isLoading}
        onClose={() => repo.setRepositoryPendingDelete(null)}
        onConfirm={repo.handleDeleteRepositoryRecord}
      />

      <IgnoreDialog
        open={ignore.isIgnoreDialogOpen}
        onClose={() => ignore.setIsIgnoreDialogOpen(false)}
        ignoreRules={ignore.ignoreRules}
        isIgnoreLoading={ignore.isIgnoreLoading}
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
        committableFiles={commit.committableFiles}
        selectedCommitKeys={commit.selectedCommitKeys}
        selectedCommitCount={commit.selectedCommitCount}
        hasGitCommitSelection={commit.hasGitCommitSelection}
        pushAfterCommit={commit.pushAfterCommit}
        commitMessage={commit.commitMessage}
        isCommitLoading={commit.isCommitLoading}
        vcsLabels={VcsLabels}
        onToggleAllFiles={commit.toggleAllCommitFiles}
        onToggleFile={commit.toggleCommitFile}
        onPushToggle={commit.setPushAfterCommit}
        onCommitMessageChange={commit.setCommitMessage}
        onSubmit={handleCommitRepository}
      />

      <SettingsDialog
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={updateSettings}
      />
    </main>
  );
}

export default App;
