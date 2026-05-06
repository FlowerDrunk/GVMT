import { FormEvent } from "react";
import type { ChangeItem, QualityCheckResult, VcsType } from "../../lib/api";
import { Modal, ModalHeading } from "../shared/Modal";
import { Switch } from "../shared/Switch";
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
        title="提交变更"
        titleId={titleId}
        onClose={onClose}
      />
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
      <div className="commit-quality-summary" data-state={latestQualityResult?.status ?? "idle"}>
        <span>最近一次本地质量检查</span>
        {latestQualityResult ? (
          <>
            <strong>{latestQualityResult.summary}</strong>
            <small>
              {latestQualityResult.label} · {latestQualityResult.command} · {formatQualityCheckTime(latestQualityResult.finishedAt)}
            </small>
          </>
        ) : (
          <>
            <strong>尚未运行</strong>
            <small>可以先在右侧“评审与质量”中运行 build、UI 测试或 cargo check。</small>
          </>
        )}
      </div>
      <form className="commit-form" onSubmit={onSubmit}>
        <div className="commit-file-toolbar">
          <button type="button" className="secondary-button" onClick={() => onToggleAllFiles(committableFiles)}>
            {selectedCommitCount === committableFiles.length ? "取消全选" : "全选文件"}
          </button>
          {hasGitCommitSelection ? (
            <Switch
              id="commit-push-toggle"
              checked={pushAfterCommit}
              onCheckedChange={onPushToggle}
              label="Git 提交后 push"
            />
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
