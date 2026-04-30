import { FormEvent } from "react";
import type { ChangeItem, VcsType } from "../../lib/api";
import { ChangeBadge } from "../shared/ChangeBadge";

function changeKey(change: Pick<ChangeItem, "path" | "vcsType">) {
  return `${change.vcsType}:${change.path}`;
}

interface CommitDialogProps {
  open: boolean;
  onClose: () => void;
  committableFiles: ChangeItem[];
  selectedCommitKeys: Set<string>;
  selectedCommitCount: number;
  hasGitCommitSelection: boolean;
  pushAfterCommit: boolean;
  commitMessage: string;
  isCommitLoading: boolean;
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
  committableFiles,
  selectedCommitKeys,
  selectedCommitCount,
  hasGitCommitSelection,
  pushAfterCommit,
  commitMessage,
  isCommitLoading,
  vcsLabels,
  onToggleAllFiles,
  onToggleFile,
  onPushToggle,
  onCommitMessageChange,
  onSubmit,
}: CommitDialogProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card commit-dialog" role="dialog" aria-modal="true" aria-labelledby="commit-dialog-title">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Commit changes</p>
            <h3 id="commit-dialog-title">提交变更</h3>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="关闭">
            ×
          </button>
        </div>
        <div className="commit-dialog-summary">
          <div>
            <span>选中文件</span>
            <strong>{selectedCommitCount}</strong>
          </div>
          <div>
            <span>可提交</span>
            <strong>{committableFiles.length}</strong>
          </div>
          <div>
            <span>Git push</span>
            <strong>{hasGitCommitSelection && pushAfterCommit ? "开启" : "关闭"}</strong>
          </div>
        </div>
        <form className="commit-form" onSubmit={onSubmit}>
          <div className="commit-file-toolbar">
            <button type="button" className="secondary-button" onClick={() => onToggleAllFiles(committableFiles)}>
              {selectedCommitCount === committableFiles.length ? "取消全选" : "全选文件"}
            </button>
            {hasGitCommitSelection ? (
              <label className="commit-push-toggle">
                <input
                  type="checkbox"
                  checked={pushAfterCommit}
                  onChange={(event) => onPushToggle(event.currentTarget.checked)}
                />
                Git 提交后 push
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
            <span>提交信息</span>
            <textarea
              value={commitMessage}
              onChange={(event) => onCommitMessageChange(event.currentTarget.value)}
              placeholder="说明这次变更的目的..."
              rows={4}
            />
          </label>
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={onClose}>
              取消
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={isCommitLoading || selectedCommitCount === 0 || !commitMessage.trim()}
            >
              {isCommitLoading ? "提交中..." : "提交选中文件"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
