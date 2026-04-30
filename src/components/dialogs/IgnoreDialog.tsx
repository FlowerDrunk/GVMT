import type { IgnoreRules, SvnIgnoreEntry } from "../../lib/api";
import { EmptyState } from "../shared/EmptyState";

interface IgnoreDialogProps {
  open: boolean;
  onClose: () => void;
  ignoreRules: IgnoreRules | null;
  isIgnoreLoading: boolean;
  onSaveGitignore: () => void;
  onSaveSvnIgnore: (entry: SvnIgnoreEntry) => void;
  onGitignoreContentChange: (content: string) => void;
  onSvnRulesChange: (directory: string, rules: string[]) => void;
}

export function IgnoreDialog({
  open,
  onClose,
  ignoreRules,
  isIgnoreLoading,
  onSaveGitignore,
  onSaveSvnIgnore,
  onGitignoreContentChange,
  onSvnRulesChange,
}: IgnoreDialogProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card ignore-dialog" role="dialog" aria-modal="true" aria-labelledby="ignore-dialog-title">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Ignore management</p>
            <h3 id="ignore-dialog-title">忽略管理</h3>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="关闭">
            ×
          </button>
        </div>

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
                <button
                  className="primary-button"
                  type="button"
                  disabled={isIgnoreLoading}
                  onClick={onSaveGitignore}
                >
                  保存 .gitignore
                </button>
              </section>
            ) : null}

            {(ignoreRules.vcsType === "svn" || ignoreRules.vcsType === "mixed") ? (
              <section className="ignore-section">
                <div className="ignore-section-header">
                  <h4>SVN svn:ignore</h4>
                  <span className="soft-chip">{ignoreRules.svnEntries.length} 个目录</span>
                </div>
                {ignoreRules.svnEntries.length === 0 ? (
                  <EmptyState
                    compact
                    title="暂无 SVN 忽略规则"
                    description="从文件变更列表右键选择忽略此文件来添加，或直接在目录上设置 svn:ignore 属性。"
                  />
                ) : (
                  ignoreRules.svnEntries.map((entry) => (
                    <div className="svn-ignore-entry" key={entry.directory}>
                      <div className="svn-ignore-entry-header">
                        <span>{entry.directory || "仓库根目录"}</span>
                      </div>
                      <textarea
                        className="ignore-editor"
                        value={entry.rules.join("\n")}
                        onChange={(event) =>
                          onSvnRulesChange(
                            entry.directory,
                            event.target.value.split("\n").filter((r) => r.trim().length > 0),
                          )
                        }
                        rows={4}
                      />
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={isIgnoreLoading}
                        onClick={() => onSaveSvnIgnore(entry)}
                      >
                        保存
                      </button>
                    </div>
                  ))
                )}
              </section>
            ) : null}
          </div>
        ) : (
          <EmptyState compact title="正在加载…" description="" />
        )}
      </section>
    </div>
  );
}
