import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addRepository,
  detectRepository,
  isTauriRuntime,
  listRepositories,
  refreshRepository,
  Repository,
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

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            G
          </span>
          <div>
            <h1>GVMT</h1>
            <p>通用版本控制工具</p>
          </div>
        </div>

        <nav className="nav-stack" aria-label="主导航">
          <button className="nav-item active" type="button">
            仓库工作台
          </button>
          <button className="nav-item" type="button" disabled>
            代码评审
          </button>
          <button className="nav-item" type="button" disabled>
            质量检查
          </button>
          <button className="nav-item" type="button" disabled>
            设置
          </button>
        </nav>

        <section className="panel">
          <div className="section-heading">
            <h2>仓库</h2>
            <button className="ghost-button" type="button" onClick={refreshRepositories} disabled={isLoading}>
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
                  <span>{vcsLabels[repository.vcsType]}</span>
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
            <p className="subtitle">统一管理 Git 与 SVN 仓库，先把高频操作做轻、做快、做清楚。</p>
          </div>
          <div className="topbar-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={!selectedRepository || isLoading}
              onClick={handleRefreshSelected}
            >
              重新检测
            </button>
            <button className="secondary-button" type="button" disabled={!selectedRepository}>
              更新
            </button>
            <button className="primary-button" type="button" disabled={!selectedRepository}>
              提交并 Push
            </button>
          </div>
        </header>

        <section className="content-grid">
          <div className="stats-strip" aria-label="仓库统计">
            <div className="stat-card">
              <span>总仓库</span>
              <strong>{repositoryStats.total}</strong>
            </div>
            <div className="stat-card">
              <span>Git</span>
              <strong>{repositoryStats.git}</strong>
            </div>
            <div className="stat-card">
              <span>SVN</span>
              <strong>{repositoryStats.svn}</strong>
            </div>
            <div className="stat-card">
              <span>待确认</span>
              <strong>{repositoryStats.unknown}</strong>
            </div>
          </div>

          <div className="panel add-panel">
            <div className="panel-title-row">
              <div>
                <p className="eyebrow">Repository intake</p>
                <h3>添加仓库</h3>
              </div>
              <span className="soft-chip">本地 SQLite</span>
            </div>
            <form onSubmit={handleAddRepository}>
              <label htmlFor="repo-path">本地路径</label>
              <div className="input-row">
                <input
                  id="repo-path"
                  placeholder="例如 C:\\Projects\\example"
                  value={path}
                  onChange={(event) => setPath(event.target.value)}
                />
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
            {!isTauriRuntime() ? (
              <p className="hint">当前在浏览器预览模式，仓库检测和 SQLite 写入需要 Tauri 运行时。</p>
            ) : null}
          </div>

          <div className="panel detail-panel">
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
          </div>

          <div className="panel roadmap-panel">
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
              <span data-state="active">Win11 风格工作台</span>
            </div>
          </div>
        </section>

        <footer className="statusbar">
          <span className={isLoading ? "status-dot busy" : "status-dot"} />
          {status}
        </footer>
      </section>
    </main>
  );
}

export default App;
