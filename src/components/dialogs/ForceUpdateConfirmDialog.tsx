import { Modal, ModalHeading } from "../shared/Modal";
import { Button } from "../ui/button";
import type { Translator } from "../../lib/i18n";

interface ForceUpdateConfirmDialogProps {
  open: boolean;
  repositoryName?: string;
  repositoryPath?: string;
  onClose: () => void;
  onConfirm: () => void;
  t: Translator;
}

export function ForceUpdateConfirmDialog({
  open,
  repositoryName,
  repositoryPath,
  onClose,
  onConfirm,
  t,
}: ForceUpdateConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="force-update-title" className="confirm-dialog">
      <ModalHeading
        eyebrow="SVN"
        title={t("forceUpdate.title")}
        titleId="force-update-title"
        onClose={onClose}
        t={t}
      />
      <div className="confirm-warning">
        <p dangerouslySetInnerHTML={{ __html: t("forceUpdate.warning1") }} />
        <p>{t("forceUpdate.warning2")}</p>
        <ol>
          <li><strong>Cleanup</strong> — {t("forceUpdate.step1")}</li>
          <li><strong>Revert -R</strong> — {t("forceUpdate.step2")}</li>
          <li><strong>Update</strong> — {t("forceUpdate.step3")}</li>
        </ol>
        <p className="confirm-warning-highlight">{t("forceUpdate.warningLoss")}</p>
      </div>
      {repositoryName || repositoryPath ? (
        <dl className="metadata compact">
          {repositoryName ? <div><dt>{t("repo.name")}</dt><dd>{repositoryName}</dd></div> : null}
          {repositoryPath ? <div><dt>{t("review.path")}</dt><dd>{repositoryPath}</dd></div> : null}
        </dl>
      ) : null}
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>
          {t("ui.cancel")}
        </Button>
        <Button variant="destructive" onClick={onConfirm}>
          {t("forceUpdate.confirmBtn")}
        </Button>
      </div>
    </Modal>
  );
}
