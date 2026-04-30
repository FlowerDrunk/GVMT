import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addRepository,
  detectRepository,
  isTauriRuntime,
  listRepositories,
  Repository,
} from "./lib/api";

const emptyStateCopy = {
  title: "还没有仓库",
  body: "添加一个 Git 或 SVN 工作副本，GVMT 会识别类型并记录到本地 SQLite。",
};

function App() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [path, setPath] = useState("");
  const [status, setStatus] = useState("准备就绪");
  const [isLoading, setIsLoading] = useState(false);

  const selectedRepository = useMemo(
    () => repositories.find((repository) => repository.id === selectedId) ?? repositories[0],
    [repositories, selectedId],
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

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">G</span>
          <div>
            <h1>GVMT</h1>
            <p>通用版本控制工具</p>
          </div>
        </div>

        <section className="panel">
          <div className="section-heading">
            <h2>仓库</h2>
            <button type="button" onClick={refreshRepositories} disabled={isLoading}>
              刷新
            </button>
          </div>
          <div className="repo-list">
            {repositories.length === 0 ? (
              <div className="empty-list">暂无仓库</div>
            ) : (
              repositories.map((repository) => (
                <button
                  className={`repo-item ${selectedRepository?.id === repository.id ? "active" : ""}`}
                  key={repository.id}
                  type="button"
                  onClick={() => setSelectedId(repository.id)}
                >
                  <strong>{repository.name}</strong>
                  <span>{repository.vcsType.toUpperCase()}</span>
                </button>
              ))
            )}
          </div>
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Windows first · React · SQLite</p>
            <h2>{selectedRepository?.name ?? "仓库工作台"}</h2>
          </div>
          <div className="topbar-actions">
            <button type="button" disabled={!selectedRepository}>
              更新
            </button>
            <button type="button" disabled={!selectedRepository}>
              提交并 Push
            </button>
          </div>
        </header>

        <section className="content-grid">
          <div className="panel add-panel">
            <h3>添加仓库</h3>
            <form onSubmit={handleAddRepository}>
              <label htmlFor="repo-path">本地路径</label>
              <div className="input-row">
                <input
                  id="repo-path"
                  placeholder="例如 C:\\Projects\\example"
                  value={path}
                  onChange={(event) => setPath(event.target.value)}
                />
                <button type="button" onClick={handleDetect} disabled={isLoading || !isTauriRuntime()}>
                  检测
                </button>
                <button type="submit" disabled={isLoading || !isTauriRuntime()}>
                  添加
                </button>
              </div>
            </form>
            {!isTauriRuntime() ? (
              <p className="hint">当前在浏览器预览模式，仓库检测和 SQLite 写入需要 Tauri 运行时。</p>
            ) : null}
          </div>

          <div className="panel detail-panel">
            {selectedRepository ? (
              <>
                <div className="repo-header">
                  <div>
                    <p className="eyebrow">{selectedRepository.vcsType.toUpperCase()}</p>
                    <h3>{selectedRepository.name}</h3>
                  </div>
                  <span className="status-pill">已记录</span>
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
          </div>

          <div className="panel roadmap-panel">
            <h3>当前阶段目标</h3>
            <div className="task-list">
              <span>项目骨架</span>
              <span>SQLite 仓库记录</span>
              <span>Git / SVN 检测</span>
              <span>首屏工作台</span>
            </div>
          </div>
        </section>

        <footer className="statusbar">{status}</footer>
      </section>
    </main>
  );
}

export default App;

