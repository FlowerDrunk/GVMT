import type {
  QualityCheckResult,
  QualityCheckStatus,
  QualityCheckTemplate,
  QualityCheckType,
  Repository,
  RepositoryStatus,
} from "../../lib/api";
import type { Translator } from "../../lib/i18n";
import { GitHubPanel } from "../workspace/GitHubPanel";
import { Button } from "../ui/button";

type QualityCheckView = QualityCheckTemplate & {
  status: QualityCheckStatus;
  result?: QualityCheckResult;
};

interface ReviewPaneProps {
  selectedRepository: Repository | undefined;
  currentReviewState: string;
  currentChangeCount: number;
  repositoryStatus: RepositoryStatus | null;
  t: Translator;
  qualityChecks: QualityCheckView[];
  isQualityCheckLoading: boolean;
  onRunQualityCheck: (checkType: QualityCheckType) => void;
}

export function ReviewPane({
  selectedRepository,
  currentReviewState,
  currentChangeCount,
  repositoryStatus,
  t,
  qualityChecks,
  isQualityCheckLoading,
  onRunQualityCheck,
}: ReviewPaneProps) {
  const latestResult = qualityChecks
    .map((check) => check.result)
    .filter((result): result is QualityCheckResult => Boolean(result))
    .sort((left, right) => right.finishedAt - left.finishedAt)[0];

  const isGitRepo =
    selectedRepository?.vcsType === "git" || selectedRepository?.vcsType === "mixed";

  return (
    <aside className="context-pane">
      {isGitRepo ? (
        <GitHubPanel selectedRepository={selectedRepository} t={t} />
      ) : null}

      <section className="context-section review-stage">
        <div className="review-title-row">
          <h3>{t("review.reviewQuality")}</h3>
          <span>{repositoryStatus ? `${currentChangeCount} ${t("review.changesCount")}` : t("review.notDetected")}</span>
        </div>
        <div className="quality-steps">
          <span data-state={repositoryStatus ? "done" : "active"}>{t("review.stepRefresh")}</span>
          <span data-state={repositoryStatus?.clean ? "done" : "active"}>{t("review.stepChanges")}</span>
          <span data-state="pending">{t("review.stepReview")}</span>
          <span data-state="pending">{t("review.stepQuality")}</span>
        </div>

        <div className="quality-check-panel">
          <div className="quality-check-header">
            <div>
              <strong>{t("review.qualityCheck")}</strong>
              <span>{isQualityCheckLoading ? t("general.loading") : t("review.qualityDesc")}</span>
            </div>
          </div>
          <div className="quality-check-list">
            {qualityChecks.map((check) => (
              <div className="quality-check-item" data-status={check.status} key={check.checkType}>
                <div className="quality-check-main">
                  <span className="quality-check-state">{qualityStatusLabel(check.status)}</span>
                  <strong>{check.label}</strong>
                  <code>{check.command}</code>
                </div>
                <Button variant="secondary" disabled={!selectedRepository || !check.available || check.status === "running"} onClick={() => onRunQualityCheck(check.checkType)} title={check.available ? `${t("review.run")} ${check.label}` : check.unavailableReason ?? t("review.idle")}>
                  {check.status === "running" ? t("review.running") : t("review.run")}
                </Button>
                {check.result ? (
                  <div className="quality-check-result">
                    <span>{formatCheckTime(check.result.finishedAt)}</span>
                    <strong>{check.result.summary}</strong>
                    <pre>{check.result.output}</pre>
                  </div>
                ) : check.unavailableReason ? (
                  <p className="quality-check-unavailable">{check.unavailableReason}</p>
                ) : null}
              </div>
            ))}
          </div>

          <div className="quality-check-latest" data-empty={!latestResult}>
            <span>{t("review.recentResult")}</span>
            {latestResult ? (
              <>
                <strong>{latestResult.summary}</strong>
                <small>{latestResult.label} · {formatCheckTime(latestResult.finishedAt)}</small>
              </>
            ) : (
              <strong>{t("review.noResult")}</strong>
            )}
          </div>
        </div>
      </section>
    </aside>
  );
}

function qualityStatusLabel(status: QualityCheckStatus) {
  switch (status) {
    case "running":
      return "运行中";
    case "success":
      return "通过";
    case "failed":
      return "失败";
    default:
      return "未运行";
  }
}

function formatCheckTime(timestamp: number) {
  if (!timestamp) return "尚未运行";
  return new Date(timestamp * 1000).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
