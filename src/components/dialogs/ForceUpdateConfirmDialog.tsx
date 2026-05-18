import { Modal, ModalHeading } from "../shared/Modal";
import { Button } from "../ui/button";

interface ForceUpdateConfirmDialogProps {
  open: boolean;
  repositoryName?: string;
  repositoryPath?: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function ForceUpdateConfirmDialog({
  open,
  repositoryName,
  repositoryPath,
  onClose,
  onConfirm,
}: ForceUpdateConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="force-update-title" className="confirm-dialog">
      <ModalHeading
        eyebrow="SVN"
        title="强制更新确认"
        titleId="force-update-title"
        onClose={onClose}
      />
      <div className="confirm-warning">
        <p>强制更新将<strong>还原整个仓库</strong>到服务器最新版本。</p>
        <p>此操作包含三个步骤：</p>
        <ol>
          <li><strong>Cleanup</strong> — 解除工作副本锁定</li>
          <li><strong>Revert -R</strong> — 丢弃所有本地修改（不可撤销）</li>
          <li><strong>Update</strong> — 拉取服务器最新版本</li>
        </ol>
        <p className="confirm-warning-highlight">所有未提交的本地修改将永久丢失。</p>
      </div>
      {repositoryName || repositoryPath ? (
        <dl className="metadata compact">
          {repositoryName ? <div><dt>仓库</dt><dd>{repositoryName}</dd></div> : null}
          {repositoryPath ? <div><dt>路径</dt><dd>{repositoryPath}</dd></div> : null}
        </dl>
      ) : null}
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>
          取消
        </Button>
        <Button variant="destructive" onClick={onConfirm}>
          确认强制更新
        </Button>
      </div>
    </Modal>
  );
}
