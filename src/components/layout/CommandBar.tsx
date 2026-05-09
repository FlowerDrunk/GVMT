import type { Repository } from "../../lib/api";
import { VcsLabels } from "../../lib/constants";
import type { Translator } from "../../lib/i18n";
import { Button } from "../ui/button";

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

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6A1.7 1.7 0 0 0 10.4 3V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.2.62.78 1 1.43 1H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
  );
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
        {selectedRepository?.branchOrRevision ? (
          <button className="command-branch" type="button" onClick={onSwitchBranch}>
            {selectedRepository.branchOrRevision}
          </button>
        ) : null}
        <span className="command-sep" />
        <div className="command-metrics">
          <span>{t("command.changes")} <strong>{currentChangeCount}</strong></span>
          <span>{currentReviewState}</span>
        </div>
      </div>

      <div className="command-actions">
        <div className="command-action-group">
          <Button variant="ghost" size="sm" type="button" disabled={!selectedRepository || isLoading} onClick={onLoadRepositoryStatus}>
            刷新
          </Button>
          <Button variant="ghost" size="sm" type="button" disabled={!selectedRepository || isLoading} onClick={onRefreshSelected}>
            重检测
          </Button>
        </div>

        <div className="command-action-group">
          <Button variant="secondary" size="sm" type="button" disabled={!canOpenCommitDialog || isCommitLoading} onClick={onOpenCommitDialog}>
            提交
          </Button>
          <Button variant="secondary" size="sm" type="button" disabled={!selectedRepository || isIgnoreLoading} onClick={onOpenIgnoreDialog}>
            Ignore
          </Button>
        </div>

        <Button variant="default" size="sm" type="button" disabled={!selectedRepository || isLoading} onClick={onUpdateRepository}>
          更新
        </Button>

        <Button variant="ghost" type="button" onClick={onOpenSettings} title={t("activity.settings")}>
          <SettingsIcon />
        </Button>
      </div>
    </header>
  );
}
