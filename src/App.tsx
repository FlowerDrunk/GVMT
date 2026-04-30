import { FormEvent, MouseEvent, useEffect, useRef, useState } from "react";
import fileIconUrl from "../src-tauri/icons/file.png";
import folderIconUrl from "../src-tauri/icons/folder.png";
import { changeKey, VcsLabels } from "./lib/constants";
import { useTheme } from "./lib/theme";
import {
  ChangeItem,
  commitRepository,
  type OperationResult,
  VcsType,
} from "./lib/api";
import {
  buildChangeNodeMap,
  buildChangeTree,
  buildFileEntryMap,
  changeTreeToViewNodes,
  ChangeTreeNode,
  emptyStateCopy,
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
import { useCommit } from "./hooks/useCommit";
import { useContextMenu } from "./hooks/useContextMenu";
import { useVisibleSections } from "./hooks/useVisibleSections";
import { useRepositories } from "./hooks/useRepositories";
import { useRepositoryStatus } from "./hooks/useRepositoryStatus";
import { useFileTree } from "./hooks/useFileTree";
import { useChangeTree } from "./hooks/useChangeTree";
import { useIgnoreRules } from "./hooks/useIgnoreRules";
import { ActivityRail } from "./components/layout/ActivityRail";
import { CommandBar } from "./components/layout/CommandBar";
import { ExplorerPane } from "./components/panels/ExplorerPane";
import { FileBrowserPanel } from "./components/panels/FileBrowserPanel";
import { StatusPanel } from "./components/panels/StatusPanel";
import { ChangesPane } from "./components/panels/ChangesPane";
import { ReviewPane } from "./components/panels/ReviewPane";

function App() {
  const [status, setStatus] = useState("准备就绪");
  const [isLoading, setIsLoading] = useState(false);

  const { visibleSections, toggleSection } = useVisibleSections();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const ignoreContextMenu = useContextMenu<{ path: string; vcsType: VcsType }>();

  const repo = useRepositories({ setStatus, setIsLoading });

  const statusHook = useRepositoryStatus({
    selectedRepository: repo.selectedRepository,
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
    repo.repoContextMenu.close();
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
      ? [
          {
            name: repo.selectedRepository.name,
            path: "",
            children: changeTreeData,
          },
        ]
      : changeTreeData;
  const fileTreeNodes = fileTree.repositoryFiles ? toFileTreeNodes(fileTree.repositoryFiles.entries) : [];
  const fileEntryMap = fileTree.repositoryFiles ? buildFileEntryMap(fileTree.repositoryFiles.entries) : new Map();
  const changeTreeViewNodes = changeTreeToViewNodes(changeTreeWithRoot);
  const changeNodeMap = buildChangeNodeMap(changeTreeWithRoot);
  const appShellClassName = `app-shell ${visibleSections.repositories ? "" : "repositories-collapsed"}`;
  const workbenchClassName = [
    "workbench",
    visibleSections.changes ? "with-changes" : "",
    visibleSections.review ? "with-review" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const handleFileTreeToggle = (path: string) => {
    const entry = fileEntryMap.get(path);
    if (entry) {
      void fileTree.handleExpandFileEntry(entry);
    }
  };

  const renderFileRow = (node: TreeViewNode, _level: number, _isExpanded: boolean) => {
    const entry = fileEntryMap.get(node.path);
    const isDirectory = node.children.length > 0;
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
    const isDirectory = node.children.length > 0;
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

  return (
    <main className={appShellClassName}>
      <ActivityRail
        visibleSections={visibleSections}
        toggleSection={toggleSection}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        isLoading={isLoading}
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
          onRepositoryContextMenu={repo.handleRepositoryContextMenu}
          onRefreshRepositories={repo.refreshRepositories}
        />
      ) : null}

      <section className="workspace">
        <CommandBar
          visibleSections={visibleSections}
          toggleSection={toggleSection}
          selectedRepository={repo.selectedRepository}
          isLoading={isLoading}
          isIgnoreLoading={ignore.isIgnoreLoading}
          canOpenCommitDialog={commit.canOpenCommitDialog}
          isCommitLoading={commit.isCommitLoading}
          onRefreshSelected={repo.handleRefreshSelected}
          onLoadRepositoryStatus={statusHook.handleLoadRepositoryStatus}
          onUpdateRepository={statusHook.handleUpdateRepository}
          onOpenIgnoreDialog={ignore.handleOpenIgnoreDialog}
          onOpenCommitDialog={() => commit.setIsCommitDialogOpen(true)}
        />

        <div className={workbenchClassName}>
          <section className="main-thread">
            <section className="hero-panel">
              <div className="hero-copy">
                <p className="eyebrow">Repository session</p>
                <h3>{repo.selectedRepository ? "当前仓库会话" : "从左侧打开一个仓库"}</h3>
                <p>
                  {repo.selectedRepository
                    ? "围绕当前仓库查看状态、执行更新，并把后续提交、评审和质量检查放在同一条工作流里。"
                    : emptyStateCopy.body}
                </p>
              </div>
              <div className="hero-metrics" aria-label="当前仓库概览">
                <div>
                  <span>变更</span>
                  <strong>{currentChangeCount}</strong>
                </div>
                <div>
                  <span>类型</span>
                  <strong>{repo.selectedRepository ? VcsLabels[repo.selectedRepository.vcsType] : "-"}</strong>
                </div>
                <div>
                  <span>评审</span>
                  <strong>{currentReviewState}</strong>
                </div>
              </div>
            </section>

            <section className="workflow-card">
              <div className="workflow-header">
                <div>
                  <p className="eyebrow">Active workflow</p>
                  <h3>版本控制流程</h3>
                </div>
                <span className="soft-chip">本地优先</span>
              </div>
              <div className="step-grid">
                <button type="button" disabled={!repo.selectedRepository || isLoading} onClick={statusHook.handleLoadRepositoryStatus}>
                  <span>01</span>
                  <strong>刷新状态</strong>
                  <small>读取 Git / SVN 工作区变更</small>
                </button>
                <button type="button" disabled={!repo.selectedRepository || isLoading} onClick={statusHook.handleUpdateRepository}>
                  <span>02</span>
                  <strong>更新仓库</strong>
                  <small>Git pull 或 SVN update</small>
                </button>
                <button type="button" disabled={!commit.canOpenCommitDialog} onClick={() => commit.setIsCommitDialogOpen(true)}>
                  <span>03</span>
                  <strong>提交变更</strong>
                  <small>选择文件、填写信息并提交</small>
                </button>
                <button type="button" disabled>
                  <span>04</span>
                  <strong>发起评审</strong>
                  <small>0 阶段后补充</small>
                </button>
              </div>
            </section>

            {visibleSections.files ? (
              <FileBrowserPanel
                repositoryFiles={fileTree.repositoryFiles}
                selectedRepository={repo.selectedRepository}
                isFileBrowserLoading={fileTree.isFileBrowserLoading}
                onLoadRepositoryFiles={fileTree.handleLoadRepositoryFiles}
                breadcrumbs={breadcrumbs}
                fileTreeNodes={fileTreeNodes}
                expandedFilePaths={fileTree.expandedFilePaths}
                renderFileRow={renderFileRow}
                onFileTreeToggle={handleFileTreeToggle}
                onContextMenu={handleChangeRowContextMenu}
              />
            ) : null}

            <StatusPanel
              repositoryStatus={statusHook.repositoryStatus}
              selectedRepository={repo.selectedRepository}
              isLoading={isLoading}
              onLoadRepositoryStatus={statusHook.handleLoadRepositoryStatus}
              onOpenSvnDownload={statusHook.handleOpenSvnDownload}
            />

            {statusHook.operationResults.length > 0 ? (
              <section className="panel operation-panel">
                <div className="panel-title-row">
                  <div>
                    <p className="eyebrow">Operation result</p>
                    <h3>最近操作</h3>
                  </div>
                  <span className="soft-chip">更新</span>
                </div>
                <div className="operation-list">
                  {statusHook.operationResults.map((result) => (
                    <div
                      className={`operation-card ${result.success ? "success" : "failed"}`}
                      key={`${result.vcsType}-${result.operation}`}
                    >
                      <div className="operation-heading">
                        <strong>{VcsLabels[result.vcsType]}</strong>
                        <span>{result.summary}</span>
                      </div>
                      {result.warning ? (
                        <div className="operation-warning">
                          <p>{result.warning}</p>
                          {result.missingSvnCli ? (
                            <div className="hint-actions">
                              <button
                                className="secondary-button"
                                type="button"
                                onClick={() => statusHook.handleOpenSvnDownload("tortoise")}
                              >
                                下载 / 修改 TortoiseSVN
                              </button>
                              <button
                                className="secondary-button"
                                type="button"
                                onClick={() => statusHook.handleOpenSvnDownload("sliksvn")}
                              >
                                下载 SlikSVN
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {result.output ? <pre>{result.output}</pre> : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </section>

          {visibleSections.changes ? (
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
          ) : null}

          {visibleSections.review ? (
            <ReviewPane
              selectedRepository={repo.selectedRepository}
              currentReviewState={currentReviewState}
              currentChangeCount={currentChangeCount}
              repositoryStatus={statusHook.repositoryStatus}
              selectedChange={changeTree.selectedChange}
              diffPreview={changeTree.diffPreview}
              isDiffLoading={changeTree.isDiffLoading}
            />
          ) : null}

        </div>

        <footer className="statusbar">
          <span className={isLoading ? "status-dot busy" : "status-dot"} />
          <span>{status}</span>
        </footer>
      </section>
      {repo.repoContextMenu.menu ? (
        <div
          className="context-menu"
          style={{ left: repo.repoContextMenu.menu.x, top: repo.repoContextMenu.menu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="danger"
            type="button"
            onClick={() => {
              repo.setRepositoryPendingDelete(repo.repoContextMenu.menu!.data);
              repo.repoContextMenu.close();
            }}
          >
            删除仓库记录
          </button>
        </div>
      ) : null}

      {ignoreContextMenu.menu ? (
        <div
          className="context-menu"
          style={{ left: ignoreContextMenu.menu.x, top: ignoreContextMenu.menu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => ignore.handleAddIgnoreRule(ignoreContextMenu.menu!.data.path, ignoreContextMenu.menu!.data.vcsType)}
          >
            忽略此文件
          </button>
        </div>
      ) : null}

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
    </main>
  );
}

export default App;
