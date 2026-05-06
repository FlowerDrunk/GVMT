import type { Repository } from "../../lib/api";
import { VcsLabels } from "../../lib/constants";

interface DashboardCardProps {
  selectedRepository: Repository | undefined;
  currentChangeCount: number;
  currentReviewState: string;
}

export function DashboardCard({
  selectedRepository,
  currentChangeCount,
  currentReviewState,
}: DashboardCardProps) {
  return (
    <section className="panel dashboard-card">
      <div className="dashboard-main">
        <span className={`repo-dot ${selectedRepository ? (selectedRepository.vcsType === "unknown" ? "warning" : "ready") : "warning"}`} />
        <strong className="dashboard-repo-name">
          {selectedRepository?.name ?? "未选择仓库"}
        </strong>
        <span className="soft-chip">
          {selectedRepository ? VcsLabels[selectedRepository.vcsType] : "-"}
        </span>
      </div>
      <div className="dashboard-metrics">
        <div className="dashboard-metric">
          <span>变更</span>
          <strong>{currentChangeCount}</strong>
        </div>
        <div className="dashboard-metric">
          <span>状态</span>
          <strong>{currentReviewState}</strong>
        </div>
        <div className="dashboard-metric">
          <span>分支</span>
          <strong>{selectedRepository?.branchOrRevision ?? "-"}</strong>
        </div>
      </div>
    </section>
  );
}
