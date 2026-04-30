import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addRepository,
  detectRepository,
  getRepositoryStatus,
  isTauriRuntime,
  listRepositoryFiles,
  listRepositories,
  openSvnCliDownloadPage,
  OperationResult,
  refreshRepository,
  Repository,
  RepositoryDirectory,
  RepositoryStatus,
  updateRepository,
  VcsType,
} from "./lib/api";

const emptyStateCopy = {
  title: "还没有仓库",
  body: "添加一个 Git 或 SVN 工作副本，GVMT 会识别类型并记录到本地 SQLite。",
};

const vcsLabels: Record<VcsType, string> = {
  git: "Git",
  svn: "SVN",
  mixed: "Git + SVN",
  unknown: "未知",
};

const vcsDescriptions: Record<VcsType, string> = {
  git: "已检测到 Git 工作区",
  svn: "已检测到 SVN 工作副本",
  mixed: "当前目录同时包含 Git 与 SVN 信息",
  unknown: "未检测到 Git 或 SVN 元数据",
};

const changeLabels: Record<string, string> = {
  added: "新增",
  modified: "修改",
  deleted: "删除",
  renamed: "重命名",
  untracked: "未跟踪",
  conflicted: "冲突",
  unknown: "未知",
};

function formatFileSize(size: number | null) {
  if (size === null) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatModifiedAt(value: number | null) {
  if (value === null) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value * 1000));
}

function fileBreadcrumbs(path: string) {
  if (!path) return [];
  const parts = path.split("/");
  return parts.map((part, index) => ({
    name: part,
    path: parts.slice(0, index + 1).join("/"),
  }));
}

function statusTone(vcsType: VcsType) {
  if (vcsType === "unknown") return "warning";
  if (vcsType === "mixed") return "mixed";
  return "ready";
}

function App() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [path, setPath] = useState("");
  const [status, setStatus] = useState("准备就绪");
  const [isLoading, setIsLoading] = useState(false);
  const [isFileBrowserLoading, setIsFileBrowserLoading] = useState(false);
  const [repositoryStatus, setRepositoryStatus] = useState<RepositoryStatus | null>(null);
  const [operationResults, setOperationResults] = useState<OperationResult[]>([]);
  const [repositoryFiles, setRepositoryFiles] = useState<RepositoryDirectory | null>(null);

  const selectedRepository = useMemo(
    () => repositories.find((repository) => repository.id === selectedId) ?? repositories[0],
    [repositories, selectedId],
  );
  const repositoryStats = useMemo(
    () => ({
      total: repositories.length,
      git: repositories.filter((repository) => repository.vcsType === "git").length,
      svn: repositories.filter((repository) => repository.vcsType === "svn").length,
      unknown: repositories.filter((repository) => repository.vcsType === "unknown").length,
    }),
    [repositories],
  );

  async function refreshRepositories() {
    setIsLoading(true);
    try {
      const nextRepositories = await listRepositories();
      setRepositories(nextRepositories);
      if (!selectedId && nextRepositories.length > 0) {
        setSelectedId(nextRepositories[0].id);
      }
      setStatus(`已加载 ${nextRepositories.length} 个仓库`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refreshRepositories();
  }, []);

  async function handleAddRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPath = path.trim();
    if (!trimmedPath) {
      setStatus("请输入本地仓库路径");
      return;
    }

    setIsLoading(true);
    try {
      const repository = await addRepository({ path: trimmedPath });
      await refreshRepositories();
      setSelectedId(repository.id);
      setPath("");
      setStatus(`已添加 ${repository.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDetect() {
    if (!path.trim()) {
      setStatus("请输入需要检测的路径");
      return;
    }

    setIsLoading(true);
    try {
      const detected = await detectRepository(path.trim());
      setStatus(`检测结果：${detected.name} / ${detected.vcsType}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRefreshSelected() {
    if (!selectedRepository) {
      setStatus("请先选择一个仓库");
      return;
    }

    setIsLoading(true);
    try {
      const refreshed = await refreshRepository(selectedRepository.id);
      await refreshRepositories();
      setSelectedId(refreshed.id);
      setStatus(`已重新检测 ${refreshed.name}：${refreshed.vcsType}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLoadRepositoryStatus() {
    if (!selectedRepository) {
      setStatus("请先选择一个仓库");
      return;
    }

    setIsLoading(true);
    try {
      const nextStatus = await getRepositoryStatus(selectedRepository.id);
      setRepositoryStatus(nextStatus);
      setStatus(nextStatus.clean ? "工作区干净" : `检测到 ${nextStatus.summary.total} 个变更`);
    } catch (error) {
      setRepositoryStatus(null);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleOpenSvnDownload(target: "tortoise" | "sliksvn") {
    try {
      await openSvnCliDownloadPage(target);
      setStatus(target === "sliksvn" ? "已打开 SlikSVN 下载页" : "已打开 TortoiseSVN 下载页");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleUpdateRepository() {
    if (!selectedRepository) {
      setStatus("请先选择一个仓库");
      return;
    }

    setIsLoading(true);
    try {
      const results = await updateRepository(selectedRepository.id);
      setOperationResults(results);
      const failed = results.filter((result) => !result.success);
      setStatus(failed.length === 0 ? "更新完成" : `${failed.length} 个更新步骤失败`);
      await handleLoadRepositoryStatus();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLoadRepositoryFiles(relativePath = "") {
    if (!selectedRepository) {
      setStatus("请先选择一个仓库");
      return;
    }

    setIsFileBrowserLoading(true);
    try {
      const nextFiles = await listRepositoryFiles(selectedRepository.id, relativePath);
      setRepositoryFiles(nextFiles);
      setStatus(nextFiles.path ? `已打开 ${nextFiles.path}` : "已打开仓库根目录");
    } catch (error) {
      setRepositoryFiles(null);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsFileBrowserLoading(false);
    }
  }

  useEffect(() => {
    setRepositoryStatus(null);
    setOperationResults([]);
    setRepositoryFiles(null);
  }, [selectedRepository?.id]);

  useEffect(() => {
    if (selectedRepository && isTauriRuntime()) {
      void handleLoadRepositoryFiles();
    }
  }, [selectedRepository?.id]);

  const currentChangeCount = repositoryStatus?.summary.total ?? 0;
  const currentReviewState = repositoryStatus
    ? repositoryStatus.clean
      ? "可进入评审"
      : "有待处理变更"
    : "等待检测";
  const breadcrumbs = fileBreadcrumbs(repositoryFiles?.path ?? "");

  return (
    <main className="app-shell">
      <aside className="activity-rail" aria-label="主导航">
        <div className="rail-logo">G</div>
        <nav className="rail-nav">
          <button className="rail-button active" type="button" title="仓库">
            <span aria-hidden="true">⌂</span>
            <small>仓库</small>
          </button>
          <button className="rail-button" type="button" title="评审" disabled>
            <span aria-hidden="true">◎</span>
            <small>评审</small>
          </button>
          <button className="rail-button" type="button" title="质量" disabled>
            <span aria-hidden="true">✓</span>
            <small>质量</small>
          </button>
          <button className="rail-button" type="button" title="设置" disabled>
            <span aria-hidden="true">⚙</span>
            <small>设置</small>
          </button>
        </nav>
        <div className="rail-status" title={isLoading ? "处理中" : "准备就绪"}>
          <span className={isLoading ? "status-dot busy" : "status-dot"} />
        </div>
      </aside>

      <aside className="explorer-pane">
        <header className="pane-header">
          <div>
            <h1>GVMT</h1>
            <p>版本控制工作台</p>
          </div>
          <button className="icon-button" type="button" onClick={refreshRepositories} disabled={isLoading} title="刷新仓库">
            ↻
          </button>
        </header>

        <section className="add-strip">
          <form onSubmit={handleAddRepository}>
            <label htmlFor="repo-path">打开本地仓库</label>
            <div className="path-row">
              <input
                id="repo-path"
                placeholder="C:\\Projects\\example"
                value={path}
                onChange={(event) => setPath(event.target.value)}
              />
            </div>
            <div className="form-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={handleDetect}
                disabled={isLoading || !isTauriRuntime()}
              >
                检测
              </button>
              <button className="primary-button" type="submit" disabled={isLoading || !isTauriRuntime()}>
                添加
              </button>
            </div>
          </form>
          {!isTauriRuntime() ? <p className="inline-warning">需要 Tauri 运行时访问本地仓库。</p> : null}
        </section>

        <section className="repo-section">
          <div className="section-title">
            <span>仓库</span>
            <strong>{repositories.length}</strong>
          </div>
          <div className="repo-list">
            {repositories.length === 0 ? (
              <div className="empty-list">{emptyStateCopy.title}</div>
            ) : (
              repositories.map((repository) => (
                <button
                  className={`repo-item ${selectedRepository?.id === repository.id ? "active" : ""}`}
                  key={repository.id}
                  type="button"
                  onClick={() => setSelectedId(repository.id)}
                >
                  <span className={`repo-dot ${statusTone(repository.vcsType)}`} />
                  <span className="repo-copy">
                    <strong>{repository.name}</strong>
                    <small>{repository.path}</small>
                  </span>
                  <span className="repo-type">{vcsLabels[repository.vcsType]}</span>
                </button>
              ))
            )}
          </div>
        </section>
      </aside>

      <section className="workspace">
        <header className="command-bar">
          <div className="command-title">
            <p className="eyebrow">Windows first · React · SQLite</p>
            <h2>{selectedRepository?.name ?? "选择或添加仓库"}</h2>
          </div>
          <div className="command-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={!selectedRepository || isLoading}
              onClick={handleRefreshSelected}
            >
              重新检测
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!selectedRepository || isLoading}
              onClick={handleLoadRepositoryStatus}
            >
              刷新状态
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={!selectedRepository || isLoading}
              onClick={handleUpdateRepository}
            >
              更新
            </button>
          </div>
        </header>

        <div className="workbench">
          <section className="main-thread">
            <section className="hero-panel">
              <div className="hero-copy">
                <p className="eyebrow">Repository session</p>
                <h3>{selectedRepository ? "当前仓库会话" : "从左侧打开一个仓库"}</h3>
                <p>
                  {selectedRepository
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
                  <strong>{selectedRepository ? vcsLabels[selectedRepository.vcsType] : "-"}</strong>
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
                <button type="button" disabled={!selectedRepository || isLoading} onClick={handleLoadRepositoryStatus}>
                  <span>01</span>
                  <strong>刷新状态</strong>
                  <small>读取 Git / SVN 工作区变更</small>
                </button>
                <button type="button" disabled={!selectedRepository || isLoading} onClick={handleUpdateRepository}>
                  <span>02</span>
                  <strong>更新仓库</strong>
                  <small>Git pull 或 SVN update</small>
                </button>
                <button type="button" disabled>
                  <span>03</span>
                  <strong>提交变更</strong>
                  <small>默认包含 push，可在设置关闭</small>
                </button>
                <button type="button" disabled>
                  <span>04</span>
                  <strong>发起评审</strong>
                  <small>预留 Git / SVN 线上评审</small>
                </button>
              </div>
            </section>

            <section className="panel file-browser-panel">
              <div className="panel-title-row">
                <div>
                  <p className="eyebrow">Repository files</p>
                  <h3>文件浏览</h3>
                </div>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={!selectedRepository || isFileBrowserLoading}
                  onClick={() => handleLoadRepositoryFiles(repositoryFiles?.path ?? "")}
                >
                  刷新
                </button>
              </div>
              <div className="file-toolbar">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={repositoryFiles?.parentPath === null || repositoryFiles?.parentPath === undefined || isFileBrowserLoading}
                  onClick={() => handleLoadRepositoryFiles(repositoryFiles?.parentPath ?? "")}
                >
                  返回上级
                </button>
                <div className="breadcrumb" aria-label="当前路径">
                  <button type="button" onClick={() => handleLoadRepositoryFiles("")} disabled={isFileBrowserLoading}>
                    根目录
                  </button>
                  {breadcrumbs.map((breadcrumb) => (
                    <button
                      type="button"
                      key={breadcrumb.path}
                      onClick={() => handleLoadRepositoryFiles(breadcrumb.path)}
                      disabled={isFileBrowserLoading}
                    >
                      {breadcrumb.name}
                    </button>
                  ))}
                </div>
              </div>
              {repositoryFiles ? (
                repositoryFiles.entries.length === 0 ? (
                  <div className="empty-state compact">
                    <h3>目录为空</h3>
                    <p>当前目录下没有可展示的文件或文件夹。</p>
                  </div>
                ) : (
                  <div className="file-list">
                    {repositoryFiles.entries.map((entry) => (
                      <button
                        className="file-row"
                        type="button"
                        key={entry.path}
                        disabled={entry.entryType !== "directory" || isFileBrowserLoading}
                        onClick={() => handleLoadRepositoryFiles(entry.path)}
                      >
                        <span className={`file-icon ${entry.entryType}`} aria-hidden="true">
                          {entry.entryType === "directory" ? "▸" : "·"}
                        </span>
                        <strong>{entry.name}</strong>
                        <span>{entry.entryType === "directory" ? "文件夹" : formatFileSize(entry.size)}</span>
                        <time>{formatModifiedAt(entry.modifiedAt)}</time>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <div className="empty-state compact">
                  <h3>{selectedRepository ? "尚未加载文件" : "未选择仓库"}</h3>
                  <p>{selectedRepository ? "点击刷新读取当前仓库目录。" : "从左侧选择一个仓库后，这里会显示文件列表。"}</p>
                </div>
              )}
            </section>

            <section className="panel status-panel">
              <div className="panel-title-row">
                <div>
                  <p className="eyebrow">Workspace status</p>
                  <h3>工作区状态</h3>
                </div>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={!selectedRepository || isLoading}
                  onClick={handleLoadRepositoryStatus}
                >
                  刷新
                </button>
              </div>
              {repositoryStatus ? (
                <>
                  <div className="change-summary" aria-label="变更统计">
                    <div>
                      <span>总变更</span>
                      <strong>{repositoryStatus.summary.total}</strong>
                    </div>
                    <div>
                      <span>新增</span>
                      <strong>{repositoryStatus.summary.added}</strong>
                    </div>
                    <div>
                      <span>修改</span>
                      <strong>{repositoryStatus.summary.modified}</strong>
                    </div>
                    <div>
                      <span>未跟踪</span>
                      <strong>{repositoryStatus.summary.untracked}</strong>
                    </div>
                  </div>
                  {repositoryStatus.warning ? (
                    <div className="hint">
                      <p>{repositoryStatus.warning}</p>
                      {repositoryStatus.missingSvnCli ? (
                        <div className="hint-actions">
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => handleOpenSvnDownload("tortoise")}
                          >
                            下载 / 修改 TortoiseSVN
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => handleOpenSvnDownload("sliksvn")}
                          >
                            下载 SlikSVN
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {repositoryStatus.changes.length === 0 ? (
                    <div className="empty-state compact">
                      <h3>{repositoryStatus.warning ? "暂无可展示变更" : "工作区干净"}</h3>
                      <p>{repositoryStatus.warning ?? "没有检测到新增、修改、删除或冲突文件。"}</p>
                    </div>
                  ) : (
                    <div className="change-list">
                      {repositoryStatus.changes.slice(0, 80).map((change) => (
                        <div className="change-row" key={`${change.vcsType}-${change.status}-${change.path}`}>
                          <span className={`change-badge ${change.status}`}>{changeLabels[change.status]}</span>
                          <span className="change-path">{change.path}</span>
                          <span className="change-vcs">{vcsLabels[change.vcsType]}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="empty-state compact">
                  <h3>尚未刷新状态</h3>
                  <p>选择仓库后点击“刷新状态”，这里会显示 Git / SVN 的变更摘要和文件列表。</p>
                </div>
              )}
            </section>

            {operationResults.length > 0 ? (
              <section className="panel operation-panel">
                <div className="panel-title-row">
                  <div>
                    <p className="eyebrow">Operation result</p>
                    <h3>最近操作</h3>
                  </div>
                  <span className="soft-chip">更新</span>
                </div>
                <div className="operation-list">
                  {operationResults.map((result) => (
                    <div
                      className={`operation-card ${result.success ? "success" : "failed"}`}
                      key={`${result.vcsType}-${result.operation}`}
                    >
                      <div className="operation-heading">
                        <strong>{vcsLabels[result.vcsType]}</strong>
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
                                onClick={() => handleOpenSvnDownload("tortoise")}
                              >
                                下载 / 修改 TortoiseSVN
                              </button>
                              <button
                                className="secondary-button"
                                type="button"
                                onClick={() => handleOpenSvnDownload("sliksvn")}
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

          <aside className="context-pane">
            <section className="panel detail-panel">
              {selectedRepository ? (
                <>
                  <div className="repo-header">
                    <div>
                      <p className="eyebrow">{vcsLabels[selectedRepository.vcsType]}</p>
                      <h3>{selectedRepository.name}</h3>
                    </div>
                    <span className={`status-pill ${statusTone(selectedRepository.vcsType)}`}>已记录</span>
                  </div>
                  <div className={`detection-card ${statusTone(selectedRepository.vcsType)}`}>
                    <strong>{vcsDescriptions[selectedRepository.vcsType]}</strong>
                    <span>
                      {selectedRepository.vcsType === "unknown"
                        ? "如果这是 SVN 工作副本，请确认目录中存在 .svn 元数据，或点击重新检测。"
                        : "仓库元数据已写入本地数据库，可继续查看状态和后续操作。"}
                    </span>
                  </div>
                  <dl className="metadata">
                    <div>
                      <dt>路径</dt>
                      <dd>{selectedRepository.path}</dd>
                    </div>
                    <div>
                      <dt>远端</dt>
                      <dd>{selectedRepository.remoteUrl ?? "未检测到"}</dd>
                    </div>
                    <div>
                      <dt>分支 / Revision</dt>
                      <dd>{selectedRepository.branchOrRevision ?? "未检测到"}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <div className="empty-state">
                  <h3>{emptyStateCopy.title}</h3>
                  <p>{emptyStateCopy.body}</p>
                </div>
              )}
            </section>

            <section className="panel stats-panel">
              <div className="panel-title-row">
                <div>
                  <p className="eyebrow">Workspace</p>
                  <h3>仓库概览</h3>
                </div>
              </div>
              <div className="stats-grid" aria-label="仓库统计">
                <div>
                  <span>总仓库</span>
                  <strong>{repositoryStats.total}</strong>
                </div>
                <div>
                  <span>Git</span>
                  <strong>{repositoryStats.git}</strong>
                </div>
                <div>
                  <span>SVN</span>
                  <strong>{repositoryStats.svn}</strong>
                </div>
                <div>
                  <span>待确认</span>
                  <strong>{repositoryStats.unknown}</strong>
                </div>
              </div>
            </section>

            <section className="panel roadmap-panel">
              <div className="panel-title-row">
                <div>
                  <p className="eyebrow">Phase 1</p>
                  <h3>当前阶段目标</h3>
                </div>
              </div>
              <div className="task-list">
                <span data-state="done">项目骨架</span>
                <span data-state="done">SQLite 仓库记录</span>
                <span data-state="done">Git / SVN 检测</span>
                <span data-state="done">仓库更新操作</span>
                <span data-state="active">Codex 风格工作台布局</span>
              </div>
            </section>
          </aside>
        </div>

        <footer className="statusbar">
          <span className={isLoading ? "status-dot busy" : "status-dot"} />
          <span>{status}</span>
        </footer>
      </section>
    </main>
  );
}

export default App;
