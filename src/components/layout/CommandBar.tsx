import type { Repository } from "../../lib/api";
import { VcsLabels } from "../../lib/constants";

interface CommandBarProps {
  selectedRepository: Repository | undefined;
  currentChangeCount: number;
  currentReviewState: string;
  isLoading: boolean;
  isIgnoreLoading: boolean;
  canOpenCommitDialog: boolean;
  isCommitLoading: boolean;
  onRefreshSelected: () => void;
  onLoadRepositoryStatus: () => void;
  onUpdateRepository: () => void;
  onOpenIgnoreDialog: () => void;
  onOpenCommitDialog: () => void;
  onOpenSettings: () => void;
}

export function CommandBar({
  selectedRepository,
  currentChangeCount,
  currentReviewState,
  isLoading,
  isIgnoreLoading,
  canOpenCommitDialog,
  isCommitLoading,
  onRefreshSelected,
  onLoadRepositoryStatus,
  onUpdateRepository,
  onOpenIgnoreDialog,
  onOpenCommitDialog,
  onOpenSettings,
}: CommandBarProps) {
  return (
    <header className="command-bar">
      <div className="command-info">
        <span className={`repo-dot ${selectedRepository ? (selectedRepository.vcsType === "unknown" ? "warning" : "ready") : "warning"}`} />
        <strong className="command-repo-name">
          {selectedRepository?.name ?? "选择或添加仓库"}
        </strong>
        {selectedRepository ? (
          <span className="soft-chip">{VcsLabels[selectedRepository.vcsType]}</span>
        ) : null}
        <span className="command-sep" />
        <div className="command-metrics">
          <span>变更 <strong>{currentChangeCount}</strong></span>
          <span>{currentReviewState}</span>
          {selectedRepository?.branchOrRevision ? (
            <span className="command-branch">{selectedRepository.branchOrRevision}</span>
          ) : null}
        </div>
      </div>
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
        <button
          className="ghost-button"
          type="button"
          onClick={onOpenSettings}
          title="设置"
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
