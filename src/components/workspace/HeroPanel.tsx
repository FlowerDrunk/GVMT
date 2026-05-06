import type { Repository } from "../../lib/api";
import { VcsLabels } from "../../lib/constants";
import { emptyStateCopy } from "../../lib/utils";

interface HeroPanelProps {
  selectedRepository: Repository | undefined;
  currentChangeCount: number;
  currentReviewState: string;
}

export function HeroPanel({
  selectedRepository,
  currentChangeCount,
  currentReviewState,
}: HeroPanelProps) {
  return (
    <section className="hero-panel">
      <div className="hero-copy">
        <p className="eyebrow">Repository session</p>
        <h3>{selectedRepository ? "当前仓库会话" : "从左侧打开一个仓库"}</h3>
        <p>
          {selectedRepository
            ? "围绕当前仓库查看状态、执行更新，并把后续提交、评审和质量检查放在同一条工作流里。"
            : emptyStateCopy.body}
        </p>
      </div>
      <div className="hero-metrics" aria-label="当前仓库概览">
        <div>
          <span>变更</span>
          <strong>{currentChangeCount}</strong>
        </div>
        <div>
          <span>类型</span>
          <strong>{selectedRepository ? VcsLabels[selectedRepository.vcsType] : "-"}</strong>
        </div>
        <div>
          <span>评审</span>
          <strong>{currentReviewState}</strong>
        </div>
      </div>
    </section>
  );
}
