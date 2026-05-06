import { Modal, ModalHeading } from "../shared/Modal";

interface DeleteConfirmDialogProps {
  repository: {
    name: string;
    path: string;
  } | null;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({
  repository,
  isLoading,
  onClose,
  onConfirm,
}: DeleteConfirmDialogProps) {
  if (!repository) return null;

  const titleId = "delete-repo-title";

  return (
    <Modal open onClose={onClose} labelledBy={titleId} className="confirm-dialog">
      <ModalHeading
        eyebrow="Repository record"
        title="删除仓库记录"
        titleId={titleId}
        onClose={onClose}
      />
      <p>
        将从 GVMT 的本地列表中移除 <strong>{repository.name}</strong>，不会删除磁盘上的仓库文件。
      </p>
      <dl className="metadata compact">
        <div>
          <dt>路径</dt>
          <dd>{repository.path}</dd>
        </div>
      </dl>
      <div className="modal-actions">
        <button className="secondary-button" type="button" onClick={onClose}>
          取消
        </button>
        <button className="danger-button" type="button" disabled={isLoading} onClick={onConfirm}>
          删除记录
        </button>
      </div>
    </Modal>
  );
}
