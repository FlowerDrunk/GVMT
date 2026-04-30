import type { Repository } from "../../lib/api";
import type { VisibleSections } from "../../hooks/useVisibleSections";

interface CommandBarProps {
  visibleSections: VisibleSections;
  toggleSection: (section: keyof VisibleSections) => void;
  selectedRepository: Repository | undefined;
  isLoading: boolean;
  isIgnoreLoading: boolean;
  canOpenCommitDialog: boolean;
  isCommitLoading: boolean;
  onRefreshSelected: () => void;
  onLoadRepositoryStatus: () => void;
  onUpdateRepository: () => void;
  onOpenIgnoreDialog: () => void;
  onOpenCommitDialog: () => void;
}

export function CommandBar({
  visibleSections,
  toggleSection,
  selectedRepository,
  isLoading,
  isIgnoreLoading,
  canOpenCommitDialog,
  isCommitLoading,
  onRefreshSelected,
  onLoadRepositoryStatus,
  onUpdateRepository,
  onOpenIgnoreDialog,
  onOpenCommitDialog,
}: CommandBarProps) {
  return (
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
          onClick={onRefreshSelected}
        >
          重新检测
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={!selectedRepository || isLoading}
          onClick={onLoadRepositoryStatus}
        >
          刷新状态
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={!canOpenCommitDialog || isCommitLoading}
          onClick={onOpenCommitDialog}
        >
          提交
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={!selectedRepository || isIgnoreLoading}
          onClick={onOpenIgnoreDialog}
        >
          忽略
        </button>
        <button
          className="primary-button"
          type="button"
          disabled={!selectedRepository || isLoading}
          onClick={onUpdateRepository}
        >
          更新
        </button>
      </div>
    </header>
  );
}
