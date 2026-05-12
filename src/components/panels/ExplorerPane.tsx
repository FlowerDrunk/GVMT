import { FormEvent, useMemo, useState } from "react";
import type { Repository } from "../../lib/api";
import { addRepository, detectRepository, isTauriRuntime, pickFolder } from "../../lib/api";
import { statusTone } from "../../lib/utils";
import { VcsLabels } from "../../lib/constants";
import { ContextMenu, ContextMenuItem } from "../shared/ContextMenu";
import { Button } from "../ui/button";

interface ExplorerPaneProps {
  path: string;
  onPathChange: (path: string) => void;
  isLoading: boolean;
  repositories: Repository[];
  selectedRepository: Repository | undefined;
  onSelectRepository: (id: number) => void;
  onRepositoriesChanged: () => void;
  onDeleteRepository: (repository: Repository) => void;
  onRefreshRepositories: () => void;
  onDropPath: (path: string) => void;
  onSetStatus: (msg: string) => void;
  latestSvnRevisions?: Record<number, string>;
}

export function ExplorerPane({
  path,
  onPathChange,
  isLoading,
  repositories,
  selectedRepository,
  onSelectRepository,
  onRepositoriesChanged,
  onDeleteRepository,
  onRefreshRepositories,
  onDropPath,
  onSetStatus,
  latestSvnRevisions = {},
}: ExplorerPaneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const filteredRepos = useMemo(() => {
    let list = repositories;
    if (searchQuery.trim()) {
      const lower = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(lower) ||
          r.path.toLowerCase().includes(lower),
      );
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [repositories, searchQuery]);

  async function handlePickFolder() {
    setIsPickingFolder(true);
    try {
      const folderPath = await pickFolder();
      if (folderPath) {
        onPathChange(folderPath);
      }
    } catch {
      // User cancelled
    } finally {
      setIsPickingFolder(false);
    }
  }

  async function handleAddRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPath = path.trim();
    if (!trimmedPath) {
      setAddError("请先选择仓库目录");
      return;
    }

    setIsAdding(true);
    setAddError(null);
    try {
      const detected = await detectRepository(trimmedPath);
      if (detected.vcsType === "unknown") {
        setAddError("当前目录未检测到 Git 或 SVN 仓库，请确认路径正确");
        return;
      }
      await addRepository({ path: trimmedPath });
      onPathChange("");
      setShowAddForm(false);
      setAddError(null);
      onRepositoriesChanged();
      onSetStatus(`已添加 ${detected.name}`);
    } catch (error) {
      setAddError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsAdding(false);
    }
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave() {
    setIsDragOver(false);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files[0] as (File & { path?: string }) | undefined;
    if (file?.path) {
      onDropPath(file.path);
    }
  }

  const stats = useMemo(
    () => ({
      git: repositories.filter((r) => r.vcsType === "git").length,
      svn: repositories.filter((r) => r.vcsType === "svn").length,
      mixed: repositories.filter((r) => r.vcsType === "mixed").length,
    }),
    [repositories],
  );

  return (
    <aside
      className={`explorer-pane${isDragOver ? " drag-over" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="pane-header">
        <div>
          <h1>GVMT</h1>
          <p>通用版本控制工具</p>
        </div>
        <div className="pane-header-actions">
          <button
            type="button"
            className={`pane-add-btn ${showAddForm ? "active" : ""}`}
            onClick={() => { setShowAddForm(!showAddForm); setAddError(null); }}
            title={showAddForm ? "收起" : "添加仓库"}
          >
            {showAddForm ? "−" : "+"}
          </button>
        </div>
      </header>

      {showAddForm ? (
        <section className="add-strip">
          <form onSubmit={handleAddRepository}>
            <label>打开仓库目录</label>
            <div className="path-picker-row">
              <button
                type="button"
                className={`folder-picker-btn${path ? " has-path" : ""}`}
                onClick={handlePickFolder}
                disabled={isPickingFolder}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <span>{isPickingFolder ? "选择中..." : path || "点击选择文件夹..."}</span>
              </button>
            </div>
            {addError ? <p className="add-repo-error">{addError}</p> : null}
            <div className="form-actions">
              <Button
                variant="secondary"
                onClick={() => { setShowAddForm(false); setAddError(null); onPathChange(""); }}
                type="button"
              >
                取消
              </Button>
              <Button variant="default" type="submit" disabled={isAdding || !path || !isTauriRuntime()}>
                {isAdding ? "添加中..." : "添加仓库"}
              </Button>
            </div>
          </form>
          {!isTauriRuntime() ? <p className="inline-warning">请在 Tauri 桌面环境中使用完整功能</p> : null}
        </section>
      ) : null}

      <section className="repo-section">
        <div className="repo-section-header">
          <div className="section-title">
            <span>仓库列表</span>
            <div className="repo-stats-pills">
              {stats.git > 0 ? <span className="repo-stat-pill git">Git {stats.git}</span> : null}
              {stats.svn > 0 ? <span className="repo-stat-pill svn">SVN {stats.svn}</span> : null}
              {stats.mixed > 0 ? <span className="repo-stat-pill mixed">Mixed {stats.mixed}</span> : null}
            </div>
          </div>

          {repositories.length > 3 ? (
            <div className="repo-search">
              <input
                className="repo-search-input"
                placeholder="搜索仓库..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          ) : null}
        </div>

        <div className="repo-list">
          {filteredRepos.length === 0 ? (
            <div className="empty-list">
              {searchQuery ? "无匹配仓库" : "拖拽文件夹到此处，或点击 + 添加"}
            </div>
          ) : (
            filteredRepos.map((repository) => (
              <ContextMenu
                key={repository.id}
                trigger={
                  <button
                    className={`repo-item ${selectedRepository?.id === repository.id ? "active" : ""}`}
                    type="button"
                    onClick={() => onSelectRepository(repository.id)}
                  >
                    <span className={`repo-dot ${statusTone(repository.vcsType)}`} />
                    <span className="repo-copy">
                      <strong>{repository.name}</strong>
                      <span className="repo-branch">{latestSvnRevisions[repository.id] ?? repository.branchOrRevision ?? ""}</span>
                    </span>
                    <span className="repo-type">{VcsLabels[repository.vcsType]}</span>
                  </button>
                }
              >
                <ContextMenuItem
                  className="danger"
                  onSelect={() => onDeleteRepository(repository)}
                >
                  删除记录
                </ContextMenuItem>
              </ContextMenu>
            ))
          )}
        </div>
      </section>
    </aside>
  );
}
