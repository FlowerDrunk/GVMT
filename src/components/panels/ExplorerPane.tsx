import { FormEvent, MouseEvent } from "react";
import type { Repository, VcsType } from "../../lib/api";
import { isTauriRuntime } from "../../lib/api";
import { emptyStateCopy, statusTone } from "../../lib/utils";
import { VcsLabels } from "../../lib/constants";

interface ExplorerPaneProps {
  path: string;
  onPathChange: (path: string) => void;
  isLoading: boolean;
  repositories: Repository[];
  selectedRepository: Repository | undefined;
  onSelectRepository: (id: number) => void;
  onAddRepository: (event: FormEvent<HTMLFormElement>) => void;
  onDetect: () => void;
  onRepositoryContextMenu: (event: MouseEvent<HTMLButtonElement>, repository: Repository) => void;
  onRefreshRepositories: () => void;
}

export function ExplorerPane({
  path,
  onPathChange,
  isLoading,
  repositories,
  selectedRepository,
  onSelectRepository,
  onAddRepository,
  onDetect,
  onRepositoryContextMenu,
  onRefreshRepositories,
}: ExplorerPaneProps) {
  return (
    <aside className="explorer-pane">
      <header className="pane-header">
        <div>
          <h1>GVMT</h1>
          <p>版本控制工作台</p>
        </div>
        <button className="icon-button" type="button" onClick={onRefreshRepositories} disabled={isLoading} title="刷新仓库">
          ↻
        </button>
      </header>

      <section className="add-strip">
        <form onSubmit={onAddRepository}>
          <label htmlFor="repo-path">打开本地仓库</label>
          <div className="path-row">
            <input
              id="repo-path"
              placeholder="C:\\Projects\\example"
              value={path}
              onChange={(event) => onPathChange(event.target.value)}
            />
          </div>
          <div className="form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={onDetect}
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
                onClick={() => onSelectRepository(repository.id)}
                onContextMenu={(event) => onRepositoryContextMenu(event, repository)}
              >
                <span className={`repo-dot ${statusTone(repository.vcsType)}`} />
                <span className="repo-copy">
                  <strong>{repository.name}</strong>
                  <small>{repository.path}</small>
                </span>
                <span className="repo-type">{VcsLabels[repository.vcsType]}</span>
              </button>
            ))
          )}
        </div>
      </section>
    </aside>
  );
}
