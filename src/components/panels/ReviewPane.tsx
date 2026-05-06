import type { Repository, RepositoryStatus } from "../../lib/api";
import { VcsLabels } from "../../lib/constants";
import { emptyStateCopy, statusTone, vcsDescriptions } from "../../lib/utils";

interface ReviewPaneProps {
  selectedRepository: Repository | undefined;
  currentReviewState: string;
  currentChangeCount: number;
  repositoryStatus: RepositoryStatus | null;
}

export function ReviewPane({
  selectedRepository,
  currentReviewState,
  currentChangeCount,
  repositoryStatus,
}: ReviewPaneProps) {
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
                <dd>{selectedRepository.remoteUrl ?? "未检测到"}</dd>
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
      </section>
    </aside>
  );
}
