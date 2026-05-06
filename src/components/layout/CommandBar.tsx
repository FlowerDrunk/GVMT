import type { Repository } from "../../lib/api";
import { VcsLabels } from "../../lib/constants";
import type { Translator } from "../../lib/i18n";

interface CommandBarProps {
  selectedRepository: Repository | undefined;
  currentChangeCount: number;
  currentReviewState: string;
  isLoading: boolean;
  isIgnoreLoading: boolean;
  canOpenCommitDialog: boolean;
  isCommitLoading: boolean;
  t: Translator;
  onRefreshSelected: () => void;
  onLoadRepositoryStatus: () => void;
  onUpdateRepository: () => void;
  onOpenIgnoreDialog: () => void;
  onOpenCommitDialog: () => void;
  onOpenSettings: () => void;
  onSwitchBranch: () => void;
}

export function CommandBar({
  selectedRepository,
  currentChangeCount,
  currentReviewState,
  isLoading,
  isIgnoreLoading,
  canOpenCommitDialog,
  isCommitLoading,
  t,
  onRefreshSelected,
  onLoadRepositoryStatus,
  onUpdateRepository,
  onOpenIgnoreDialog,
  onOpenCommitDialog,
  onOpenSettings,
  onSwitchBranch,
}: CommandBarProps) {
  return (
    <header className="command-bar">
      <div className="command-info">
        <span className={`repo-dot ${selectedRepository ? (selectedRepository.vcsType === "unknown" ? "warning" : "ready") : "warning"}`} />
        <strong className="command-repo-name">
          {selectedRepository?.name ?? t("command.selectRepository")}
        </strong>
        {selectedRepository ? (
          <span className="soft-chip">{VcsLabels[selectedRepository.vcsType]}</span>
        ) : null}
        <span className="command-sep" />
        <div className="command-metrics">
          <span>{t("command.changes")} <strong>{currentChangeCount}</strong></span>
          <span>{currentReviewState}</span>
          {selectedRepository?.branchOrRevision ? (
            <button className="command-branch" type="button" onClick={onSwitchBranch}>
              {selectedRepository.branchOrRevision}
            </button>
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
          {t("command.redetect")}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={!selectedRepository || isLoading}
          onClick={onLoadRepositoryStatus}
        >
          {t("command.refreshStatus")}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={!canOpenCommitDialog || isCommitLoading}
          onClick={onOpenCommitDialog}
        >
          {t("command.commit")}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={!selectedRepository || isIgnoreLoading}
          onClick={onOpenIgnoreDialog}
        >
          {t("command.ignore")}
        </button>
        <button
          className="primary-button"
          type="button"
          disabled={!selectedRepository || isLoading}
          onClick={onUpdateRepository}
        >
          {t("command.update")}
        </button>
        <button
          className="ghost-button"
          type="button"
          onClick={onOpenSettings}
          title={t("activity.settings")}
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
