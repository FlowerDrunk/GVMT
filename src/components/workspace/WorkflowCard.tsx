import type { Repository } from "../../lib/api";

interface WorkflowCardProps {
  selectedRepository: Repository | undefined;
  isLoading: boolean;
  canOpenCommitDialog: boolean;
  onLoadRepositoryStatus: () => void;
  onUpdateRepository: () => void;
  onOpenCommitDialog: () => void;
  onOpenReview: () => void;
}

export function WorkflowCard({
  selectedRepository,
  isLoading,
  canOpenCommitDialog,
  onLoadRepositoryStatus,
  onUpdateRepository,
  onOpenCommitDialog,
  onOpenReview,
}: WorkflowCardProps) {
  return (
    <section className="workflow-card">
      <div className="workflow-header">
        <div>
          <p className="eyebrow">Active workflow</p>
          <h3>版本控制流程</h3>
        </div>
        <span className="soft-chip">本地优先</span>
      </div>
      <div className="step-grid">
        <button type="button" disabled={!selectedRepository || isLoading} onClick={onLoadRepositoryStatus}>
          <span>01</span>
          <strong>刷新状态</strong>
          <small>读取 Git / SVN 工作区变更</small>
        </button>
        <button type="button" disabled={!selectedRepository || isLoading} onClick={onUpdateRepository}>
          <span>02</span>
          <strong>更新仓库</strong>
          <small>Git pull 或 SVN update</small>
        </button>
        <button type="button" disabled={!canOpenCommitDialog} onClick={onOpenCommitDialog}>
          <span>03</span>
          <strong>提交变更</strong>
          <small>选择文件、填写信息并提交</small>
        </button>
        <button type="button" disabled={!selectedRepository} onClick={onOpenReview}>
          <span>04</span>
          <strong>发起评审</strong>
          <small>查看 diff、检查代码质量</small>
        </button>
      </div>
    </section>
  );
}
