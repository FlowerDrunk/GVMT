import type { IgnoreRules } from "../../lib/api";
import type { Translator } from "../../lib/i18n";
import { Modal, ModalHeading } from "../shared/Modal";
import { EmptyState } from "../shared/EmptyState";
import { Button } from "../ui/button";

interface IgnoreDialogProps {
  open: boolean;
  onClose: () => void;
  ignoreRules: IgnoreRules | null;
  isIgnoreLoading: boolean;
  t: Translator;
  onSaveGitignore: () => void;
  onSaveSvnIgnore: () => void;
  onGitignoreContentChange: (content: string) => void;
  onSvnignoreContentChange: (content: string) => void;
  onRemoveSkipWorktree: (path: string) => void;
}

export function IgnoreDialog({
  open,
  onClose,
  ignoreRules,
  isIgnoreLoading,
  t,
  onSaveGitignore,
  onSaveSvnIgnore,
  onGitignoreContentChange,
  onSvnignoreContentChange,
  onRemoveSkipWorktree,
}: IgnoreDialogProps) {
  const titleId = "ignore-dialog-title";

  return (
    <Modal open={open} onClose={onClose} labelledBy={titleId} className="ignore-dialog">
      <ModalHeading
        eyebrow="Ignore management"
        title={t("ignore.title")}
        titleId={titleId}
        onClose={onClose}
      />

      {ignoreRules ? (
        <div className="ignore-sections">
          {(ignoreRules.vcsType === "git" || ignoreRules.vcsType === "mixed") ? (
            <section className="ignore-section">
              <div className="ignore-section-header">
                <h4>Git .gitignore</h4>
                <span className="soft-chip">{ignoreRules.gitignorePath ?? ".gitignore"}</span>
              </div>
              <textarea
                className="ignore-editor"
                value={ignoreRules.gitignoreContent ?? ""}
                onChange={(event) => onGitignoreContentChange(event.target.value)}
                placeholder="# 输入忽略规则，每行一条…"
                rows={8}
              />
              <Button variant="default" disabled={isIgnoreLoading} onClick={onSaveGitignore}>
                {isIgnoreLoading ? t("ignore.saving") : t("ignore.save")} .gitignore
              </Button>
            </section>
          ) : null}

          {(ignoreRules.vcsType === "git" || ignoreRules.vcsType === "mixed") && ignoreRules.skipWorktreeFiles.length > 0 ? (
            <section className="ignore-section">
              <div className="ignore-section-header">
                <h4>Skip-Worktree（已跟踪文件隐藏）</h4>
                <span className="soft-chip">git update-index --skip-worktree</span>
              </div>
              <ul className="skip-worktree-list">
                {ignoreRules.skipWorktreeFiles.map((file) => (
                  <li key={file} className="skip-worktree-item">
                    <span className="skip-worktree-path">{file}</span>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isIgnoreLoading}
                      onClick={() => onRemoveSkipWorktree(file)}
                    >
                      恢复
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {(ignoreRules.vcsType === "svn" || ignoreRules.vcsType === "mixed") ? (
            <section className="ignore-section">
              <div className="ignore-section-header">
                <h4>SVN .svnignore</h4>
                <span className="soft-chip">仓库根目录</span>
              </div>
              <textarea
                className="ignore-editor"
                value={ignoreRules.svnignoreContent ?? ""}
                onChange={(event) => onSvnignoreContentChange(event.target.value)}
                placeholder="# SVN 忽略规则，每行一条…"
                rows={8}
              />
              <Button variant="default" disabled={isIgnoreLoading} onClick={onSaveSvnIgnore}>
                {isIgnoreLoading ? t("ignore.saving") : t("ignore.save")} .svnignore
              </Button>
            </section>
          ) : null}
        </div>
      ) : (
        <EmptyState compact title={t("general.loading")} description="" />
      )}
    </Modal>
  );
}
