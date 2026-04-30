import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import fileIconUrl from "../src-tauri/icons/file.png";
import folderIconUrl from "../src-tauri/icons/folder.png";
import {
  addRepository,
  ChangeItem,
  ChangeStatus,
  commitRepository,
  detectRepository,
  getRepositoryDiff,
  getRepositoryStatus,
  isTauriRuntime,
  listRepositoryFiles,
  listRepositories,
  openSvnCliDownloadPage,
  OperationResult,
  refreshRepository,
  Repository,
  RepositoryDirectory,
  RepositoryDiff,
  RepositoryFileEntry,
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

interface ChangeTreeNode {
  name: string;
  path: string;
  children: ChangeTreeNode[];
  change?: {
    status: ChangeStatus;
    vcsType: VcsType;
  };
}

interface VisibleSections {
  repositories: boolean;
  files: boolean;
  changes: boolean;
  review: boolean;
}

function buildChangeTree(changes: ChangeItem[]) {
  const root: ChangeTreeNode[] = [];
  const rootsByName = new Map<string, ChangeTreeNode>();

  for (const change of changes) {
    const parts = change.path.replace(/\\/g, "/").split("/").filter(Boolean);
    let children = root;
    let siblings = rootsByName;
    let currentPath = "";

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let node = siblings.get(part);
      if (!node) {
        node = {
          name: part,
          path: currentPath,
          children: [],
        };
        siblings.set(part, node);
        children.push(node);
      }

      if (index === parts.length - 1) {
        node.change = {
          status: change.status,
          vcsType: change.vcsType,
        };
      }

      children = node.children;
      siblings = new Map(node.children.map((child) => [child.name, child]));
    });
  }

  sortChangeTree(root);
  return root;
}

function sortChangeTree(nodes: ChangeTreeNode[]) {
  nodes.sort((left, right) => {
    const leftDirectory = left.children.length > 0 && !left.change;
    const rightDirectory = right.children.length > 0 && !right.change;
    if (leftDirectory !== rightDirectory) return leftDirectory ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
  nodes.forEach((node) => sortChangeTree(node.children));
}

function collectFileDirectoryPaths(entries: RepositoryFileEntry[]) {
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.entryType === "directory") {
      paths.push(entry.path);
      paths.push(...collectFileDirectoryPaths(entry.children));
    }
  }
  return paths;
}

function collectChangeDirectoryPaths(nodes: ChangeTreeNode[]) {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.children.length > 0) {
      paths.push(node.path);
      paths.push(...collectChangeDirectoryPaths(node.children));
    }
  }
  return paths;
}

function replaceFileTreeChildren(
  entries: RepositoryFileEntry[],
  targetPath: string,
  children: RepositoryFileEntry[],
): RepositoryFileEntry[] {
  return entries.map((entry) => {
    if (entry.path === targetPath) {
      return { ...entry, children };
    }

    if (entry.children.length > 0) {
      return { ...entry, children: replaceFileTreeChildren(entry.children, targetPath, children) };
    }

    return entry;
  });
}

function diffLineClassName(line: string) {
  if (line.startsWith("+++") || line.startsWith("---")) return "meta";
  if (line.startsWith("+")) return "added";
  if (line.startsWith("-")) return "deleted";
  if (line.startsWith("@@")) return "hunk";
  return "context";
}

function changeKey(change: Pick<ChangeItem, "path" | "vcsType">) {
  return `${change.vcsType}:${change.path}`;
}

function isCommittableChange(change: ChangeItem) {
  return change.status !== "conflicted" && change.status !== "unknown";
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
  const [selectedChange, setSelectedChange] = useState<ChangeItem | null>(null);
  const [diffPreview, setDiffPreview] = useState<RepositoryDiff | null>(null);
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [pushAfterCommit, setPushAfterCommit] = useState(true);
  const [selectedCommitKeys, setSelectedCommitKeys] = useState<Set<string>>(new Set());
  const [isCommitLoading, setIsCommitLoading] = useState(false);
  const [expandedFilePaths, setExpandedFilePaths] = useState<Set<string>>(new Set());
  const [loadedFilePaths, setLoadedFilePaths] = useState<Set<string>>(new Set());
  const [expandedChangePaths, setExpandedChangePaths] = useState<Set<string>>(new Set());
  const [visibleSections, setVisibleSections] = useState<VisibleSections>({
    repositories: true,
    files: true,
    changes: true,
    review: true,
  });

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

  const loadRepositoryStatus = useCallback(
    async (silent = false) => {
      if (!selectedRepository) {
        if (!silent) setStatus("请先选择一个仓库");
        return;
      }

      if (!silent) setIsLoading(true);
      try {
        const nextStatus = await getRepositoryStatus(selectedRepository.id);
        setRepositoryStatus(nextStatus);
        const nextCommitKeys = new Set(nextStatus.changes.map(changeKey));
        setSelectedCommitKeys((current) => {
          if (current.size === 0) return nextCommitKeys;
          return new Set([...current].filter((key) => nextCommitKeys.has(key)));
        });
        setExpandedChangePaths(new Set([""]));
        if (!silent) setStatus(nextStatus.clean ? "工作区干净" : `检测到 ${nextStatus.summary.total} 个变更`);
      } catch (error) {
        setRepositoryStatus(null);
        if (!silent) setStatus(error instanceof Error ? error.message : String(error));
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [selectedRepository],
  );

  async function handleLoadRepositoryStatus() {
    if (!selectedRepository) {
      setStatus("请先选择一个仓库");
      return;
    }

    await loadRepositoryStatus(false);
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
      setExpandedFilePaths(new Set());
      setLoadedFilePaths(new Set([nextFiles.path]));
      setStatus(nextFiles.path ? `已打开 ${nextFiles.path}` : "已打开仓库根目录");
    } catch (error) {
      setRepositoryFiles(null);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsFileBrowserLoading(false);
    }
  }

  function toggleSection(section: keyof VisibleSections) {
    setVisibleSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  function toggleFileNode(path: string) {
    setExpandedFilePaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  async function handleExpandFileEntry(entry: RepositoryFileEntry) {
    if (!selectedRepository || entry.entryType !== "directory") return;

    if (expandedFilePaths.has(entry.path)) {
      toggleFileNode(entry.path);
      return;
    }

    if (!loadedFilePaths.has(entry.path)) {
      setIsFileBrowserLoading(true);
      try {
        const nextDirectory = await listRepositoryFiles(selectedRepository.id, entry.path);
        setRepositoryFiles((current) =>
          current
            ? {
                ...current,
                entries: replaceFileTreeChildren(current.entries, entry.path, nextDirectory.entries),
              }
            : current,
        );
        setLoadedFilePaths((current) => new Set(current).add(entry.path));
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
        return;
      } finally {
        setIsFileBrowserLoading(false);
      }
    }

    setExpandedFilePaths((current) => new Set(current).add(entry.path));
  }

  async function handleSelectChange(path: string, change: ChangeTreeNode["change"]) {
    if (!selectedRepository || !change) return;

    const nextChange: ChangeItem = {
      path,
      status: change.status,
      vcsType: change.vcsType,
    };
    setSelectedChange(nextChange);
    setIsDiffLoading(true);
    try {
      const nextDiff = await getRepositoryDiff(selectedRepository.id, nextChange);
      setDiffPreview(nextDiff);
      setStatus(`已加载 diff：${path}`);
    } catch (error) {
      setDiffPreview(null);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDiffLoading(false);
    }
  }

  function toggleCommitFile(change: ChangeItem) {
    const key = changeKey(change);
    setSelectedCommitKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleAllCommitFiles(changes: ChangeItem[]) {
    const keys = changes.map(changeKey);
    setSelectedCommitKeys((current) => {
      const allSelected = keys.length > 0 && keys.every((key) => current.has(key));
      return allSelected ? new Set() : new Set(keys);
    });
  }

  async function handleCommitRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRepository) {
      setStatus("请先选择一个仓库");
      return;
    }

    const selectedFiles = changedFiles.filter(
      (change) => isCommittableChange(change) && selectedCommitKeys.has(changeKey(change)),
    );
    if (selectedFiles.length === 0) {
      setStatus("请选择需要提交的文件");
      return;
    }
    if (!commitMessage.trim()) {
      setStatus("请输入提交信息");
      return;
    }

    setIsCommitLoading(true);
    try {
      const results = await commitRepository(selectedRepository.id, {
        message: commitMessage,
        push: pushAfterCommit,
        files: selectedFiles,
      });
      setOperationResults(results);
      const failed = results.filter((result) => !result.success);
      setStatus(failed.length === 0 ? "提交完成" : `${failed.length} 个提交步骤失败`);
      if (failed.length === 0) {
        setCommitMessage("");
      }
      await loadRepositoryStatus(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCommitLoading(false);
    }
  }

  function toggleChangeNode(path: string) {
    setExpandedChangePaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  useEffect(() => {
    setRepositoryStatus(null);
    setOperationResults([]);
    setRepositoryFiles(null);
    setSelectedChange(null);
    setDiffPreview(null);
    setIsDiffLoading(false);
    setCommitMessage("");
    setSelectedCommitKeys(new Set());
    setIsCommitLoading(false);
    setExpandedFilePaths(new Set());
    setLoadedFilePaths(new Set());
    setExpandedChangePaths(new Set());
  }, [selectedRepository?.id]);

  useEffect(() => {
    if (!selectedRepository || !isTauriRuntime()) {
      return;
    }

    let isCancelled = false;
    async function openRepository() {
      await loadRepositoryStatus(true);
      if (!isCancelled) {
        await handleLoadRepositoryFiles();
      }
    }

    void openRepository();
    const refreshTimer = window.setInterval(() => {
      void loadRepositoryStatus(true);
    }, 12000);

    return () => {
      isCancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [selectedRepository?.id, loadRepositoryStatus]);

  const currentChangeCount = repositoryStatus?.summary.total ?? 0;
  const currentReviewState = repositoryStatus
    ? repositoryStatus.clean
      ? "可进入评审"
      : "有待处理变更"
    : "等待检测";
  const breadcrumbs = fileBreadcrumbs(repositoryFiles?.path ?? "");
  const changedFiles = repositoryStatus?.changes ?? [];
  const committableFiles = changedFiles.filter(isCommittableChange);
  const selectedCommitCount = committableFiles.filter((change) => selectedCommitKeys.has(changeKey(change))).length;
  const hasGitCommitSelection = committableFiles.some(
    (change) => change.vcsType === "git" && selectedCommitKeys.has(changeKey(change)),
  );
  const changeTree = buildChangeTree(changedFiles);
  const changeTreeWithRoot: ChangeTreeNode[] =
    selectedRepository && changeTree.length > 0
      ? [
          {
            name: selectedRepository.name,
            path: "",
            children: changeTree,
          },
        ]
      : changeTree;
  const appShellClassName = `app-shell ${visibleSections.repositories ? "" : "repositories-collapsed"}`;
  const workbenchClassName = [
    "workbench",
    visibleSections.changes ? "with-changes" : "",
    visibleSections.review ? "with-review" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const renderFileTree = (entries: RepositoryFileEntry[], level = 0) =>
    entries.map((entry) => {
      const isDirectory = entry.entryType === "directory";
      const isExpanded = expandedFilePaths.has(entry.path);

      return (
        <div className="tree-node" key={entry.path}>
          <button
            className={`tree-row file-tree-row ${isDirectory ? "directory" : "file"}`}
            type="button"
            style={{ "--tree-level": level } as CSSProperties}
            onClick={() => {
              if (!isDirectory) return;
              void handleExpandFileEntry(entry);
            }}
          >
            <span className="tree-toggle" aria-hidden="true">
              {isDirectory ? (isExpanded ? "v" : ">") : "-"}
            </span>
            <img className="tree-icon" src={isDirectory ? folderIconUrl : fileIconUrl} alt="" aria-hidden="true" />
            <strong>{entry.name}</strong>
            <span>{isDirectory ? "文件夹" : formatFileSize(entry.size)}</span>
            <time>{formatModifiedAt(entry.modifiedAt)}</time>
          </button>
          {isDirectory && isExpanded && entry.children.length > 0 ? renderFileTree(entry.children, level + 1) : null}
        </div>
      );
    });
  const renderChangeTree = (nodes: ChangeTreeNode[], level = 0) =>
    nodes.map((node) => {
      const isDirectory = node.children.length > 0;
      const isExpanded = expandedChangePaths.has(node.path);
      const status = node.change?.status ?? "unknown";
      const isSelected = selectedChange?.path === node.path && selectedChange?.vcsType === node.change?.vcsType;

      return (
        <div className="tree-node" key={node.path}>
          <button
            className={`tree-row change-tree-row ${isDirectory ? "directory" : "file"} ${isSelected ? "selected" : ""}`}
            type="button"
            style={{ "--tree-level": level } as CSSProperties}
            onClick={() => (isDirectory ? toggleChangeNode(node.path) : void handleSelectChange(node.path, node.change))}
          >
            <span className="tree-toggle" aria-hidden="true">
              {isDirectory ? (isExpanded ? "v" : ">") : "-"}
            </span>
            <img className="tree-icon" src={isDirectory ? folderIconUrl : fileIconUrl} alt="" aria-hidden="true" />
            <strong>{node.name}</strong>
            {node.change ? (
              <>
                <span className={`change-badge ${status}`}>{changeLabels[status]}</span>
                <small>{vcsLabels[node.change.vcsType]}</small>
              </>
            ) : (
              <>
                <span>{node.children.length} 项</span>
                <small>目录</small>
              </>
            )}
          </button>
          {isDirectory && isExpanded ? renderChangeTree(node.children, level + 1) : null}
        </div>
      );
    });

  return (
    <main className={appShellClassName}>
      <aside className="activity-rail" aria-label="主导航">
        <div className="rail-logo">G</div>
        <nav className="rail-nav">
          <button
            className={`rail-button ${visibleSections.repositories ? "active" : ""}`}
            type="button"
            title={visibleSections.repositories ? "关闭仓库管理" : "打开仓库管理"}
            aria-pressed={visibleSections.repositories}
            onClick={() => toggleSection("repositories")}
          >
            <span aria-hidden="true">□</span>
            <small>仓库</small>
          </button>
          <button
            className={`rail-button ${visibleSections.files ? "active" : ""}`}
            type="button"
            title={visibleSections.files ? "关闭文件浏览" : "打开文件浏览"}
            aria-pressed={visibleSections.files}
            onClick={() => toggleSection("files")}
          >
            <span aria-hidden="true">▤</span>
            <small>文件</small>
          </button>
          <button
            className={`rail-button ${visibleSections.changes ? "active" : ""}`}
            type="button"
            title={visibleSections.changes ? "关闭变更状态" : "打开变更状态"}
            aria-pressed={visibleSections.changes}
            onClick={() => toggleSection("changes")}
          >
            <span aria-hidden="true">✓</span>
            <small>变更</small>
          </button>
          <button
            className={`rail-button ${visibleSections.review ? "active" : ""}`}
            type="button"
            title={visibleSections.review ? "关闭评审质量" : "打开评审质量"}
            aria-pressed={visibleSections.review}
            onClick={() => toggleSection("review")}
          >
            <span aria-hidden="true">◎</span>
            <small>评审</small>
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

      {visibleSections.repositories ? (
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
      ) : null}

      <section className="workspace">
        <header className="command-bar">
          <div className="command-title">
            <p className="eyebrow">当前仓库</p>
            <h2>{selectedRepository?.name ?? "选择或添加仓库"}</h2>
          </div>
          <nav className="function-nav" aria-label="功能区">
            <button
              className={visibleSections.repositories ? "active" : ""}
              type="button"
              aria-pressed={visibleSections.repositories}
              onClick={() => toggleSection("repositories")}
            >
              仓库
            </button>
            <button
              className={visibleSections.files ? "active" : ""}
              type="button"
              aria-pressed={visibleSections.files}
              onClick={() => toggleSection("files")}
            >
              文件
            </button>
            <button
              className={visibleSections.changes ? "active" : ""}
              type="button"
              aria-pressed={visibleSections.changes}
              onClick={() => toggleSection("changes")}
            >
              变更
            </button>
            <button
              className={visibleSections.review ? "active" : ""}
              type="button"
              aria-pressed={visibleSections.review}
              onClick={() => toggleSection("review")}
            >
              评审
            </button>
            <button type="button" disabled>
              设置
            </button>
          </nav>
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

        <div className={workbenchClassName}>
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
                <button type="button" disabled={!repositoryStatus || committableFiles.length === 0}>
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
                  <div className="tree-list file-tree">{renderFileTree(repositoryFiles.entries)}</div>
                )
              ) : (
                <div className="empty-state compact">
                  <h3>{selectedRepository ? "尚未加载文件" : "未选择仓库"}</h3>
                  <p>{selectedRepository ? "点击刷新读取当前仓库目录。" : "从左侧选择一个仓库后，这里会显示文件列表。"}</p>
                </div>
              )}
            </section>
            ) : null}

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

            {repositoryStatus && committableFiles.length > 0 ? (
              <section className="panel commit-panel">
                <div className="panel-title-row">
                  <div>
                    <p className="eyebrow">Commit changes</p>
                    <h3>提交变更</h3>
                  </div>
                  <span className="soft-chip">{selectedCommitCount} / {committableFiles.length}</span>
                </div>
                <form className="commit-form" onSubmit={handleCommitRepository}>
                  <div className="commit-file-toolbar">
                    <button type="button" className="secondary-button" onClick={() => toggleAllCommitFiles(committableFiles)}>
                      {selectedCommitCount === committableFiles.length ? "取消全选" : "全选文件"}
                    </button>
                    {hasGitCommitSelection ? (
                      <label className="commit-push-toggle">
                        <input
                          type="checkbox"
                          checked={pushAfterCommit}
                          onChange={(event) => setPushAfterCommit(event.currentTarget.checked)}
                        />
                        Git 提交后 push
                      </label>
                    ) : null}
                  </div>
                  <div className="commit-file-list">
                    {committableFiles.map((change) => {
                      const key = changeKey(change);
                      return (
                        <label className="commit-file-row" key={key}>
                          <input
                            type="checkbox"
                            checked={selectedCommitKeys.has(key)}
                            onChange={() => toggleCommitFile(change)}
                          />
                          <span className={`change-badge ${change.status}`}>{changeLabels[change.status]}</span>
                          <strong>{change.path}</strong>
                          <small>{vcsLabels[change.vcsType]}</small>
                        </label>
                      );
                    })}
                  </div>
                  <textarea
                    value={commitMessage}
                    onChange={(event) => setCommitMessage(event.currentTarget.value)}
                    placeholder="输入提交信息..."
                    rows={3}
                  />
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={isCommitLoading || selectedCommitCount === 0 || !commitMessage.trim()}
                  >
                    {isCommitLoading ? "提交中..." : "提交选中文件"}
                  </button>
                </form>
              </section>
            ) : null}

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

          {visibleSections.changes ? (
          <aside className="changes-pane">
            <header className="changes-header">
              <button className="changes-title" type="button">
                变更状态
              </button>
              <input placeholder="筛选文件..." aria-label="筛选文件" />
            </header>
            {changedFiles.length > 0 ? (
              <div className="tree-list change-tree">{renderChangeTree(changeTreeWithRoot)}</div>
            ) : (
              <div className="changes-empty">
                <p>{repositoryStatus ? "没有匹配的文件" : "尚未刷新状态"}</p>
              </div>
            )}

            <section className="changes-stats">
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
            </section>

            <section className="changes-roadmap">
              <h3>当前阶段</h3>
              <div className="task-list compact">
                <span data-state="done">仓库文件浏览</span>
                <span data-state="active">功能分区布局</span>
              </div>
            </section>
          </aside>
          ) : null}

          {visibleSections.review ? (
          <aside className="context-pane">
            <section className="context-section repository-summary">
              <div className="section-kicker">仓库信息</div>
              <div className="summary-topline">
                <span className={`status-pill ${selectedRepository ? statusTone(selectedRepository.vcsType) : "warning"}`}>
                  {selectedRepository ? vcsLabels[selectedRepository.vcsType] : "未选择"}
                </span>
                <span className="soft-chip">{selectedRepository ? currentReviewState : "等待选择"}</span>
              </div>
              {selectedRepository ? (
                <div className="summary-copy">
                  <h3>{selectedRepository.name}</h3>
                  <p>{vcsDescriptions[selectedRepository.vcsType]}</p>
                  <dl className="metadata compact">
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
                </div>
              ) : (
                <div className="review-empty">
                  <h3>{emptyStateCopy.title}</h3>
                  <p>{emptyStateCopy.body}</p>
                </div>
              )}
            </section>

            <section className="context-section review-stage">
              <div className="review-title-row">
                <h3>评审与质量</h3>
                <span>{repositoryStatus ? `${currentChangeCount} 个变更` : "未检测"}</span>
              </div>
              <div className="quality-steps">
                <span data-state={repositoryStatus ? "done" : "active"}>刷新状态</span>
                <span data-state={repositoryStatus?.clean ? "done" : "active"}>处理变更</span>
                <span data-state="pending">发起评审</span>
                <span data-state="pending">质量检查</span>
              </div>
              {selectedChange ? (
                <div className="diff-preview">
                  <div className="diff-heading">
                    <div>
                      <span className={`change-badge ${selectedChange.status}`}>{changeLabels[selectedChange.status]}</span>
                      <strong>{selectedChange.path}</strong>
                    </div>
                    <small>{vcsLabels[selectedChange.vcsType]}</small>
                  </div>
                  {diffPreview?.warning ? <p className="diff-warning">{diffPreview.warning}</p> : null}
                  <pre aria-busy={isDiffLoading}>
                    {isDiffLoading
                      ? "正在加载 diff..."
                      : diffPreview?.content
                        ? diffPreview.content
                            .split("\n")
                            .map((line, index) => (
                              <span className={diffLineClassName(line)} key={`${index}-${line.slice(0, 16)}`}>
                                {line || " "}
                              </span>
                            ))
                        : "暂无 diff 内容"}
                  </pre>
                </div>
              ) : (
                <div className="review-empty">
                  <h3>{repositoryStatus?.clean ? "可进入评审准备" : "等待审查内容"}</h3>
                  <p>{repositoryStatus ? "从变更状态中选择一个文件后，这里会展示 Git / SVN diff 预览。" : "先刷新工作区状态，随后可进入代码评审流程。"}</p>
                </div>
              )}
            </section>
          </aside>
          ) : null}

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
