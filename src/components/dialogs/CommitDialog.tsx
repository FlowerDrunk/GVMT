import { FormEvent } from "react";
import type { ChangeItem, QualityCheckResult, VcsType } from "../../lib/api";
import type { Translator } from "../../lib/i18n";
import { changeKey } from "../../lib/constants";
import { Modal, ModalHeading } from "../shared/Modal";
import { Switch } from "../ui/switch";
import { ChangeBadge } from "../shared/ChangeBadge";
import { Button } from "../ui/button";

interface CommitDialogProps {
  open: boolean;
  onClose: () => void;
  t: Translator;
  committableFiles: ChangeItem[];
  selectedCommitKeys: Set<string>;
  selectedCommitCount: number;
  hasGitCommitSelection: boolean;
  pushAfterCommit: boolean;
  commitMessage: string;
  isCommitLoading: boolean;
  latestQualityResult: QualityCheckResult | null;
  vcsLabels: Record<VcsType, string>;
  onToggleAllFiles: (files: ChangeItem[]) => void;
  onToggleFile: (change: ChangeItem) => void;
  onPushToggle: (push: boolean) => void;
  onCommitMessageChange: (message: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function CommitDialog({
  open,
  onClose,
  t,
  committableFiles,
  selectedCommitKeys,
  selectedCommitCount,
  hasGitCommitSelection,
  pushAfterCommit,
  commitMessage,
  isCommitLoading,
  latestQualityResult,
  vcsLabels,
  onToggleAllFiles,
  onToggleFile,
  onPushToggle,
  onCommitMessageChange,
  onSubmit,
}: CommitDialogProps) {
  const titleId = "commit-dialog-title";

  return (
    <Modal open={open} onClose={onClose} labelledBy={titleId} className="commit-dialog">
      <ModalHeading
        eyebrow="Commit changes"
        title={t("commit.title")}
        titleId={titleId}
        onClose={onClose}
      />
      <div className="commit-dialog-summary">
        <div>
          <span>{t("commit.selectedFiles")}</span>
          <strong>{selectedCommitCount}</strong>
        </div>
        <div>
          <span>{t("commit.committable")}</span>
          <strong>{committableFiles.length}</strong>
        </div>
        <div>
          <span>Git push</span>
          <strong>{hasGitCommitSelection && pushAfterCommit ? t("commit.on") : t("commit.off")}</strong>
        </div>
      </div>
      <div className="commit-quality-summary" data-state={latestQualityResult?.status ?? "idle"}>
        <span>{t("commit.qualityCheck")}</span>
        {latestQualityResult ? (
          <>
            <strong>{latestQualityResult.summary}</strong>
            <small>
              {latestQualityResult.label} · {latestQualityResult.command} · {formatQualityCheckTime(latestQualityResult.finishedAt)}
            </small>
          </>
        ) : (
          <>
            <strong>{t("commit.notRun")}</strong>
            <small>{t("commit.notRunDesc")}</small>
          </>
        )}
      </div>
      <form className="commit-form" onSubmit={onSubmit}>
        <div className="commit-file-toolbar">
          <Button variant="secondary" onClick={() => onToggleAllFiles(committableFiles)}>
            {selectedCommitCount === committableFiles.length ? t("commit.deselectAll") : t("commit.selectAll")}
          </Button>
          {hasGitCommitSelection ? (
            <label className="radix-switch-label">
              <Switch
                id="commit-push-toggle"
                checked={pushAfterCommit}
                onCheckedChange={onPushToggle}
              />
              <span>{t("commit.pushAfterCommit")}</span>
            </label>
          ) : null}
        </div>
        <div className="commit-file-list">
          {committableFiles.map((change) => {
            const key = changeKey(change);
            return (
              <label className="commit-file-row" key={key}>
                <input
                  type="checkbox"
                  checked={selectedCommitKeys.has(key)}
                  onChange={() => onToggleFile(change)}
                />
                <ChangeBadge status={change.status} />
                <strong>{change.path}</strong>
                <small>{vcsLabels[change.vcsType]}</small>
              </label>
            );
          })}
        </div>
        <label className="commit-message-field">
          <span>{t("commit.message")}</span>
          <textarea
            value={commitMessage}
            onChange={(event) => onCommitMessageChange(event.currentTarget.value)}
            placeholder={t("commit.placeholder")}
            rows={4}
          />
        </label>
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>
            {t("commit.cancel")}
          </Button>
          <Button variant="default" type="submit" disabled={isCommitLoading || selectedCommitCount === 0 || !commitMessage.trim()}>
            {isCommitLoading ? t("commit.submitting") : t("commit.submit")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function formatQualityCheckTime(timestamp: number) {
  if (!timestamp) return "尚未运行";
  return new Date(timestamp * 1000).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
