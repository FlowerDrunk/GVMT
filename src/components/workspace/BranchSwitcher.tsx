import { useEffect, useState } from "react";
import type { BranchInfo, Repository } from "../../lib/api";
import type { Translator } from "../../lib/i18n";
import { listBranches, switchBranch } from "../../lib/api";
import { Modal, ModalHeading } from "../shared/Modal";

interface BranchSwitcherProps {
  open: boolean;
  onClose: () => void;
  repository: Repository | undefined;
  t: Translator;
  onSwitched: (summary: string) => void;
}

export function BranchSwitcher({ open, onClose, repository, t, onSwitched }: BranchSwitcherProps) {
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
        title={t("branch.title")}
        titleId="branch-switcher-title"
        onClose={onClose}
        t={t}
      />
      <div className="branch-list">
        {isLoading ? (
          <p className="branch-loading">{t("branch.loading")}</p>
        ) : branches.length === 0 ? (
          <p className="branch-loading">{t("branch.noInfo")}</p>
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
              {b.isCurrent ? <span className="soft-chip">{t("branch.current")}</span> : null}
              {switchingBranch === b.name ? <span>{t("branch.switching")}</span> : null}
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
