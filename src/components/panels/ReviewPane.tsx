import type { ChangeItem, Repository, RepositoryDiff, RepositoryStatus } from "../../lib/api";
import { VcsLabels } from "../../lib/constants";
import { diffLineClassName, emptyStateCopy, statusTone, vcsDescriptions } from "../../lib/utils";
import { ChangeBadge } from "../shared/ChangeBadge";

interface ReviewPaneProps {
  selectedRepository: Repository | undefined;
  currentReviewState: string;
  currentChangeCount: number;
  repositoryStatus: RepositoryStatus | null;
  selectedChange: ChangeItem | null;
  diffPreview: RepositoryDiff | null;
  isDiffLoading: boolean;
}

export function ReviewPane({
  selectedRepository,
  currentReviewState,
  currentChangeCount,
  repositoryStatus,
  selectedChange,
  diffPreview,
  isDiffLoading,
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
        {selectedChange ? (
          <div className="diff-preview">
            <div className="diff-heading">
              <div>
                <ChangeBadge status={selectedChange.status} />
                <strong>{selectedChange.path}</strong>
              </div>
              <small>{VcsLabels[selectedChange.vcsType]}</small>
            </div>
            {diffPreview?.warning ? <p className="diff-warning">{diffPreview.warning}</p> : null}
            <pre aria-busy={isDiffLoading}>
              {isDiffLoading
                ? "正在加载 diff..."
                : diffPreview?.content
                  ? diffPreview.content
                      .split("\n")
                      .map((line, index) => (
                        <span className={diffLineClassName(line)} key={`${index}-${line.slice(0, 16)}`}>
                          {line || " "}
                        </span>
                      ))
                  : "暂无 diff 内容"}
            </pre>
          </div>
        ) : (
          <div className="review-empty">
            <h3>{repositoryStatus?.clean ? "可进入评审准备" : "等待审查内容"}</h3>
            <p>{repositoryStatus ? "从变更状态中选择一个文件后，这里会展示 Git / SVN diff 预览。" : "先刷新工作区状态，随后可进入代码评审流程。"}</p>
          </div>
        )}
      </section>
    </aside>
  );
}
