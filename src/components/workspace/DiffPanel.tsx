import type { ChangeItem, RepositoryDiff } from "../../lib/api";
import { VcsLabels } from "../../lib/constants";
import { DiffCodeBlock } from "../shared/CodeBlock";
import { ChangeBadge } from "../shared/ChangeBadge";

interface DiffPanelProps {
  selectedChange: ChangeItem | null;
  diffPreview: RepositoryDiff | null;
  isDiffLoading: boolean;
  onClose: () => void;
}

export function DiffPanel({
  selectedChange,
  diffPreview,
  isDiffLoading,
  onClose,
}: DiffPanelProps) {
  if (!selectedChange) {
    return (
      <section className="panel diff-panel">
        <div className="diff-panel-placeholder">
          <p className="eyebrow">Diff view</p>
          <h3>变更详情</h3>
          <p>从变更列表中点击一个文件，这里会展示 diff 对比。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel diff-panel">
      <div className="panel-title-row">
        <div className="diff-panel-heading">
          <ChangeBadge status={selectedChange.status} />
          <strong title={selectedChange.path}>{selectedChange.path}</strong>
          <span className="soft-chip">{VcsLabels[selectedChange.vcsType]}</span>
        </div>
        <button className="icon-button" type="button" onClick={onClose} title="关闭 diff">
          ×
        </button>
      </div>
      {diffPreview?.warning ? <p className="diff-warning">{diffPreview.warning}</p> : null}
      <DiffCodeBlock
        content={isDiffLoading ? "正在加载 diff..." : diffPreview?.content || "暂无 diff 内容"}
        path={selectedChange.path}
      />
    </section>
  );
}
