import type { Translator } from "../../lib/i18n";
import { Modal, ModalHeading } from "../shared/Modal";
import { Button } from "../ui/button";

interface DeleteConfirmDialogProps {
  repository: {
    name: string;
    path: string;
  } | null;
  isLoading: boolean;
  t: Translator;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({
  repository,
  isLoading,
  t,
  onClose,
  onConfirm,
}: DeleteConfirmDialogProps) {
  if (!repository) return null;

  const titleId = "delete-repo-title";

  return (
    <Modal open onClose={onClose} labelledBy={titleId} className="confirm-dialog">
      <ModalHeading
        eyebrow="Repository record"
        title={t("delete.title")}
        titleId={titleId}
        onClose={onClose}
      />
      <p>
        {t("delete.body")} <strong>{repository.name}</strong>
      </p>
      <dl className="metadata compact">
        <div>
          <dt>{t("delete.path")}</dt>
          <dd>{repository.path}</dd>
        </div>
      </dl>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>
          {t("delete.cancel")}
        </Button>
        <Button variant="destructive" disabled={isLoading} onClick={onConfirm}>
          {t("delete.confirm")}
        </Button>
      </div>
    </Modal>
  );
}
