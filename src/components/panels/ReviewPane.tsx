import type {
  QualityCheckResult,
  QualityCheckStatus,
  QualityCheckTemplate,
  QualityCheckType,
  Repository,
  RepositoryStatus,
} from "../../lib/api";
import { VcsLabels } from "../../lib/constants";
import { emptyStateCopy, formatRemoteUrlForDisplay, statusTone, vcsDescriptions } from "../../lib/utils";

type QualityCheckView = QualityCheckTemplate & {
  status: QualityCheckStatus;
  result?: QualityCheckResult;
};

interface ReviewPaneProps {
  selectedRepository: Repository | undefined;
  currentReviewState: string;
  currentChangeCount: number;
  repositoryStatus: RepositoryStatus | null;
  qualityChecks: QualityCheckView[];
  isQualityCheckLoading: boolean;
  onRunQualityCheck: (checkType: QualityCheckType) => void;
}

export function ReviewPane({
  selectedRepository,
  currentReviewState,
  currentChangeCount,
  repositoryStatus,
  qualityChecks,
  isQualityCheckLoading,
  onRunQualityCheck,
}: ReviewPaneProps) {
  const latestResult = qualityChecks
    .map((check) => check.result)
    .filter((result): result is QualityCheckResult => Boolean(result))
    .sort((left, right) => right.finishedAt - left.finishedAt)[0];

  return (
    <aside className="context-pane">
      <section className="context-section repository-summary">
        <div className="section-kicker">仓库信息</div>
        <div className="summary-topline">
          <span className={`status-pill ${selectedRepository ? statusTone(selectedRepository.vcsType) : "warning"}`}>
            {selectedRepository ? VcsLabels[selectedRepository.vcsType] : "未选择"}
          </span>
          <span className="soft-chip">{selectedRepository ? currentReviewState : "等待选择"}</span>
        </div>
        {selectedRepository ? (
          <div className="summary-copy">
            <h3>{selectedRepository.name}</h3>
            <p>{vcsDescriptions[selectedRepository.vcsType]}</p>
            <dl className="metadata compact">
              <div>
                <dt>路径</dt>
                <dd>{selectedRepository.path}</dd>
              </div>
              <div>
                <dt>远端</dt>
                <dd className="remote-url-value" title={selectedRepository.remoteUrl ?? undefined}>
                  {formatRemoteUrlForDisplay(selectedRepository.remoteUrl)}
                </dd>
              </div>
              <div>
                <dt>分支 / Revision</dt>
                <dd>{selectedRepository.branchOrRevision ?? "未检测到"}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="review-empty">
            <h3>{emptyStateCopy.title}</h3>
            <p>{emptyStateCopy.body}</p>
          </div>
        )}
      </section>

      <section className="context-section review-stage">
        <div className="review-title-row">
          <h3>评审与质量</h3>
          <span>{repositoryStatus ? `${currentChangeCount} 个变更` : "未检测"}</span>
        </div>
        <div className="quality-steps">
          <span data-state={repositoryStatus ? "done" : "active"}>刷新状态</span>
          <span data-state={repositoryStatus?.clean ? "done" : "active"}>处理变更</span>
          <span data-state="pending">发起评审</span>
          <span data-state="pending">质量检查</span>
        </div>

        <div className="quality-check-panel">
          <div className="quality-check-header">
            <div>
              <strong>本地质量检查</strong>
              <span>{isQualityCheckLoading ? "正在读取可用命令" : "提交前参考最近一次结果"}</span>
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
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!selectedRepository || !check.available || check.status === "running"}
                  onClick={() => onRunQualityCheck(check.checkType)}
                  title={check.available ? `运行 ${check.label}` : check.unavailableReason ?? "当前检查不可用"}
                >
                  {check.status === "running" ? "运行中" : "运行"}
                </button>
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
            <span>提交前最近结果</span>
            {latestResult ? (
              <>
                <strong>{latestResult.summary}</strong>
                <small>{latestResult.label} · {formatCheckTime(latestResult.finishedAt)}</small>
              </>
            ) : (
              <strong>还没有运行本地质量检查</strong>
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
