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

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-repo-title">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Repository record</p>
            <h3 id="delete-repo-title">删除仓库记录</h3>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="关闭">
            ×
          </button>
        </div>
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
      </section>
    </div>
  );
}
