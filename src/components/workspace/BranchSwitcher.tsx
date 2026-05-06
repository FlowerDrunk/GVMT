import { useEffect, useState } from "react";
import type { BranchInfo, Repository } from "../../lib/api";
import { listBranches, switchBranch } from "../../lib/api";
import { Modal, ModalHeading } from "../shared/Modal";

interface BranchSwitcherProps {
  open: boolean;
  onClose: () => void;
  repository: Repository | undefined;
  onSwitched: (summary: string) => void;
}

export function BranchSwitcher({ open, onClose, repository, onSwitched }: BranchSwitcherProps) {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [switchingBranch, setSwitchingBranch] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !repository) return;

    setIsLoading(true);
    listBranches(repository.id)
      .then(setBranches)
      .catch(() => setBranches([]))
      .finally(() => setIsLoading(false));
  }, [open, repository?.id]);

  async function handleSwitch(branch: string) {
    if (!repository) return;

    setSwitchingBranch(branch);
    try {
      const result = await switchBranch(repository.id, branch);
      onSwitched(result.summary);
      onClose();
    } catch (error) {
      onSwitched(error instanceof Error ? error.message : String(error));
    } finally {
      setSwitchingBranch(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="branch-switcher-title" className="branch-switcher-dialog">
      <ModalHeading
        eyebrow={repository?.vcsType === "git" ? "Git branch" : "SVN switch"}
        title="分支切换"
        titleId="branch-switcher-title"
        onClose={onClose}
      />
      <div className="branch-list">
        {isLoading ? (
          <p className="branch-loading">正在加载分支列表...</p>
        ) : branches.length === 0 ? (
          <p className="branch-loading">暂无分支信息</p>
        ) : (
          branches.map((b) => (
            <button
              key={b.name}
              className={`branch-item${b.isCurrent ? " current" : ""}`}
              type="button"
              disabled={b.isCurrent || switchingBranch !== null}
              onClick={() => handleSwitch(b.name)}
            >
              <span className="branch-name">{b.name}</span>
              {b.isCurrent ? <span className="soft-chip">当前</span> : null}
              {switchingBranch === b.name ? <span>切换中...</span> : null}
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
