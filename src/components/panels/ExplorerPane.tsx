import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Repository } from "../../lib/api";
import { addRepository, detectRepository, isTauriRuntime, openInExplorer, pickFolder, updateRepositoryInfo } from "../../lib/api";
import { statusTone } from "../../lib/utils";
import { VcsLabels } from "../../lib/constants";
import { ContextMenu, ContextMenuItem } from "../shared/ContextMenu";
import { Button } from "../ui/button";
import { Modal, ModalHeading } from "../shared/Modal";

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
  onCloneRepository: (url: string, path: string, shallow: boolean, ignoreExternals: boolean) => Promise<boolean>;
  isCloningActive?: boolean;
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
  onCloneRepository,
  isCloningActive,
  latestSvnRevisions = {},
}: ExplorerPaneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<"local" | "remote">("local");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [isCloning, setIsCloning] = useState(false);
  const [shallowClone, setShallowClone] = useState(true);
  const [ignoreExternals, setIgnoreExternals] = useState(true);
  const [editRepo, setEditRepo] = useState<Repository | null>(null);
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  async function handleSaveEdit() {
    if (!editRepo) return;
    setIsSavingEdit(true);
    try {
      await updateRepositoryInfo(editRepo.id, { name: editName.trim() || undefined, notes: editNotes.trim() || undefined });
      setEditRepo(null);
      onRepositoriesChanged();
    } catch (error) {
      setAddError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingEdit(false);
    }
  }

  function openEditDialog(repo: Repository) {
    setEditRepo(repo);
    setEditName(repo.name);
    setEditNotes(repo.notes || "");
    setAddError(null);
  }

  // Detect if the remote URL looks like SVN (for showing SVN-specific options)
  const isSvnUrl = useMemo(() => {
    const lower = remoteUrl.trim().toLowerCase();
    if (!lower) return false;
    return lower.startsWith("svn://") || lower.startsWith("svn+ssh://")
      || lower.includes("/svn/") || lower.includes("/trunk")
      || lower.includes("/branches") || lower.includes("/tags");
  }, [remoteUrl]);

  // Reset cloning state when progress dialog is closed externally (e.g. cancel)
  useEffect(() => {
    if (!isCloningActive) {
      setIsCloning(false);
    }
  }, [isCloningActive]);

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

    if (addMode === "remote") {
      const trimmedUrl = remoteUrl.trim();
      const trimmedPath = path.trim();
      if (!trimmedUrl) { setAddError("请输入远程仓库地址"); return; }
      if (!trimmedPath) { setAddError("请选择本地目录"); return; }

      setIsCloning(true);
      setAddError(null);
      try {
        const ok = await onCloneRepository(trimmedUrl, trimmedPath, shallowClone, ignoreExternals);
        if (ok) {
          onPathChange("");
          setRemoteUrl("");
          setShowAddForm(false);
          setAddError(null);
          onRepositoriesChanged();
        }
      } catch (error) {
        setAddError(error instanceof Error ? error.message : String(error));
      } finally {
        setIsCloning(false);
      }
      return;
    }

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
            {/* Mode toggle */}
            <div className="add-mode-toggle">
              <button type="button" className={`add-mode-btn ${addMode === "local" ? "active" : ""}`} onClick={() => { setAddMode("local"); setAddError(null); }}>打开本地仓库</button>
              <button type="button" className={`add-mode-btn ${addMode === "remote" ? "active" : ""}`} onClick={() => { setAddMode("remote"); setAddError(null); }}>克隆远程仓库</button>
            </div>

            {addMode === "remote" ? (
              <>
                <label>远程仓库地址</label>
                <input
                  type="text"
                  placeholder="https://github.com/user/repo.git 或 SVN URL"
                  value={remoteUrl}
                  onChange={(e) => setRemoteUrl(e.target.value)}
                />
                {remoteUrl.trim() ? (
                  <div className="clone-options">
                    <span className="clone-options-label">{isSvnUrl ? "SVN 选项" : "Git 选项"}</span>
                    {isSvnUrl ? (
                      <label className="shallow-clone-label">
                        <input type="checkbox" checked={ignoreExternals} onChange={(e) => setIgnoreExternals(e.target.checked)} />
                        忽略外部依赖（svn:externals），大幅提速
                      </label>
                    ) : (
                      <label className="shallow-clone-label">
                        <input type="checkbox" checked={shallowClone} onChange={(e) => setShallowClone(e.target.checked)} />
                        浅克隆（--depth 1，仅最新版本，速度快）
                      </label>
                    )}
                  </div>
                ) : null}
              </>
            ) : null}

            <label>本地目录</label>
            <div className="path-picker-row">
              <input
                className="path-input"
                type="text"
                placeholder="输入或选择本地目录路径..."
                value={path}
                onChange={(e) => onPathChange(e.target.value)}
                onBlur={async () => {
                  const trimmed = path.trim();
                  if (!trimmed) return;
                  // If user typed a path that doesn't exist, try to create it
                  if (isTauriRuntime()) {
                    try {
                      const { invoke } = await import("@tauri-apps/api/core");
                      await invoke("ensure_directory", { path: trimmed });
                    } catch (error) {
                      const msg = error instanceof Error ? error.message : String(error);
                      if (!msg.includes("already exists") && !msg.includes("已存在")) {
                        setAddError(`无法创建目录：${msg}`);
                      }
                    }
                  }
                }}
              />
              <button
                type="button"
                className="path-picker-icon"
                onClick={handlePickFolder}
                disabled={isPickingFolder || isCloning}
                title="选择文件夹"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
            </div>
            {addError ? <p className="add-repo-error">{addError}</p> : null}
            {isCloning ? <p className="clone-progress-hint">正在克隆... 请等待完成</p> : null}
            <div className="form-actions">
              <Button
                variant="secondary"
                onClick={() => { setShowAddForm(false); setAddError(null); onPathChange(""); setRemoteUrl(""); setAddMode("local"); setIsPickingFolder(false); }}
                type="button"
              >
                取消
              </Button>
              <Button variant="default" type="submit" disabled={isAdding || isCloning || !path || !isTauriRuntime() || (addMode === "remote" && !remoteUrl.trim())}>
                {isCloning ? "克隆中..." : isAdding ? "添加中..." : addMode === "remote" ? "克隆仓库" : "添加仓库"}
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
                <ContextMenuItem onSelect={() => openEditDialog(repository)}>
                  编辑信息
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => { openInExplorer(repository.path); }}>
                  打开所在目录
                </ContextMenuItem>
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
      {editRepo ? (
        <Modal open={true} onClose={() => setEditRepo(null)} labelledBy="edit-repo-title" className="edit-repo-modal">
          <ModalHeading eyebrow="编辑仓库" title={editRepo.name} titleId="edit-repo-title" onClose={() => setEditRepo(null)} />
          <div className="edit-repo-body">
            <label>仓库名称</label>
            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} />
            <label>备注</label>
            <textarea rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="添加备注信息..." />
            {addError ? <p className="add-repo-error">{addError}</p> : null}
            <div className="form-actions">
              <Button variant="secondary" onClick={() => setEditRepo(null)} type="button">取消</Button>
              <Button variant="default" onClick={handleSaveEdit} disabled={isSavingEdit || !editName.trim()}>
                {isSavingEdit ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </aside>
  );
}
