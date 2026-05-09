import type { Repository } from "../../lib/api";
import type { Translator } from "../../lib/i18n";
import { VcsLabels } from "../../lib/constants";
import { emptyStateCopy, formatRemoteUrlForDisplay, statusTone, vcsDescriptions } from "../../lib/utils";

interface RepositorySummaryPanelProps {
  selectedRepository: Repository | undefined;
  currentReviewState: string;
  currentChangeCount: number;
  t: Translator;
}

export function RepositorySummaryPanel({
  selectedRepository,
  currentReviewState,
  currentChangeCount,
  t,
}: RepositorySummaryPanelProps) {
  return (
    <section className="panel repository-summary-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Repository info</p>
          <h3>{t("review.repoInfo")}</h3>
        </div>
        <span className={`status-pill ${selectedRepository ? statusTone(selectedRepository.vcsType) : "warning"}`}>
          {selectedRepository ? VcsLabels[selectedRepository.vcsType] : t("review.notSelected")}
        </span>
      </div>
      {selectedRepository ? (
        <div className="repository-summary-body">
          <div className="summary-topline">
            <span className="soft-chip">{currentReviewState}</span>
            <span className="command-metrics">
              <span>{t("command.changes")} <strong>{currentChangeCount}</strong></span>
            </span>
          </div>
          <dl className="metadata">
            <div>
              <dt>名称</dt>
              <dd><strong>{selectedRepository.name}</strong></dd>
            </div>
            <div>
              <dt>{t("review.path")}</dt>
              <dd>{selectedRepository.path}</dd>
            </div>
            <div>
              <dt>{t("review.remote")}</dt>
              <dd className="remote-url-value" title={selectedRepository.remoteUrl ?? undefined}>
                {formatRemoteUrlForDisplay(selectedRepository.remoteUrl)}
              </dd>
            </div>
            <div>
              <dt>{t("review.branch")}</dt>
              <dd>{selectedRepository.branchOrRevision ?? t("review.notDetected")}</dd>
            </div>
          </dl>
          <p className="repository-summary-desc">{vcsDescriptions[selectedRepository.vcsType]}</p>
        </div>
      ) : (
        <div className="review-empty">
          <h3>{emptyStateCopy.title}</h3>
          <p>{emptyStateCopy.body}</p>
        </div>
      )}
    </section>
  );
}
