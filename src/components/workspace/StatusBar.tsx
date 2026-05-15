import { useState } from "react";
import type { ChangeStatus, GitStashEntry, OperationResult, Repository, VcsType } from "../../lib/api";
import { gitReset, gitStashPush, svnRevert, svnResolve, svnResolveAccept, svnUpdateForce, type SvnAcceptType } from "../../lib/api";
import type { Translator } from "../../lib/i18n";
import { Modal, ModalHeading } from "../shared/Modal";
import { Button } from "../ui/button";

interface StatusBarProps {
  isLoading: boolean;
  status: string;
}

export function StatusBar({ isLoading, status }: StatusBarProps) {
  return (
    <footer className="statusbar">
      <span className={isLoading ? "status-dot busy" : "status-dot"} />
      {isLoading ? <span className="inline-spinner" /> : null}
      <span>{status}</span>
    </footer>
  );
}

// -- Context Menu Overlays --

interface ContextMenuState<T> {
  data: T;
  x: number;
  y: number;
}

interface RepoContextMenuOverlayProps {
  menu: ContextMenuState<Repository> | null;
  t: Translator;
  onDeleteRequest: (repository: Repository) => void;
  onClose: () => void;
}

export function RepoContextMenuOverlay({
  menu,
  t,
  onDeleteRequest,
  onClose,
}: RepoContextMenuOverlayProps) {
  if (!menu) return null;

  return (
    <div
      className="context-menu"
      style={{ left: menu.x, top: menu.y }}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        className="danger"
        type="button"
        onClick={() => {
          onDeleteRequest(menu.data);
          onClose();
        }}
      >
        {t("menu.deleteRecord")}
      </button>
    </div>
  );
}

interface IgnoreContextMenuOverlayProps {
  menu: ContextMenuState<{ path: string; vcsType: VcsType; status?: ChangeStatus }> | null;
  repositoryId: number | undefined;
  t: Translator;
  onOpenDiff: (path: string, vcsType: VcsType, status?: ChangeStatus) => void;
  onIgnoreFile: (path: string, vcsType: VcsType) => void;
  onOperationResult: (result: OperationResult) => void;
}

export function IgnoreContextMenuOverlay({
  menu,
  repositoryId,
  t,
  onOpenDiff,
  onIgnoreFile,
  onOperationResult,
}: IgnoreContextMenuOverlayProps) {
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  if (!menu) return null;

  const { path, vcsType, status } = menu.data;
  const isSvn = vcsType === "svn";
  const isGit = vcsType === "git" || vcsType === "mixed";
  const isConflicted = status === "conflicted";

  async function handleSvnRevert() {
    if (!repositoryId) return;
    try {
      const result = await svnRevert(repositoryId, path);
      onOperationResult(result);
    } catch (error) {
      onOperationResult({
        operation: "revert",
        vcsType: "svn",
        success: false,
        summary: "Revert 失败",
        output: String(error),
        warning: String(error),
        missingSvnCli: false,
      });
    }
  }

  async function handleSvnResolve() {
    if (!repositoryId) return;
    try {
      const result = await svnResolve(repositoryId, path);
      onOperationResult(result);
    } catch (error) {
      onOperationResult({
        operation: "resolve",
        vcsType: "svn",
        success: false,
        summary: "Resolve 失败",
        output: String(error),
        warning: String(error),
        missingSvnCli: false,
      });
    }
  }

  async function handleSvnResolveAccept(accept: SvnAcceptType) {
    if (!repositoryId) return;
    try {
      const result = await svnResolveAccept(repositoryId, path, accept);
      onOperationResult(result);
    } catch (error) {
      onOperationResult({
        operation: "resolve",
        vcsType: "svn",
        success: false,
        summary: "Resolve 失败",
        output: String(error),
        warning: String(error),
        missingSvnCli: false,
      });
    }
  }

  async function handleSvnUpdateForce() {
    if (!repositoryId) return;
    try {
      const result = await svnUpdateForce(repositoryId);
      onOperationResult(result);
    } catch (error) {
      onOperationResult({
        operation: "update",
        vcsType: "svn",
        success: false,
        summary: "强制更新失败",
        output: String(error),
        warning: String(error),
        missingSvnCli: false,
      });
    }
  }

  async function handleGitStashPush() {
    if (!repositoryId) return;
    try {
      const result = await gitStashPush(repositoryId);
      onOperationResult(result);
    } catch (error) {
      onOperationResult({
        operation: "stash",
        vcsType: "git",
        success: false,
        summary: "Stash 失败",
        output: String(error),
        warning: String(error),
        missingSvnCli: false,
      });
    }
  }

  async function handleGitResetSoft() {
    if (!repositoryId) return;
    try {
      const result = await gitReset(repositoryId, "soft", "HEAD");
      onOperationResult(result);
      setIsResetDialogOpen(false);
    } catch (error) {
      onOperationResult({
        operation: "reset",
        vcsType: "git",
        success: false,
        summary: "Reset 失败",
        output: String(error),
        warning: String(error),
        missingSvnCli: false,
      });
    }
  }

  return (
    <>
      <div
        className="context-menu"
        style={{ left: menu.x, top: menu.y }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          disabled={!status}
          onClick={() => onOpenDiff(path, vcsType, status)}
        >
          查看 Diff
        </button>

        {/* SVN 操作 */}
        {isSvn ? (
          <>
            {isConflicted ? (
              <>
                <div className="context-menu-label">冲突解决</div>
                <button type="button" onClick={() => handleSvnResolveAccept("theirs-full")}>
                  接受服务器版本 (theirs)
                </button>
                <button type="button" onClick={() => handleSvnResolveAccept("mine-full")}>
                  保留本地版本 (mine)
                </button>
                <button type="button" onClick={() => handleSvnResolveAccept("base")}>
                  还原原始版本 (base)
                </button>
                <button type="button" onClick={handleSvnResolve}>
                  标记已解决 (保留当前状态)
                </button>
                <div className="context-menu-separator" />
              </>
            ) : null}
            <button type="button" className="cmd-danger" onClick={handleSvnRevert}>
              SVN Revert
            </button>
            {!isConflicted ? (
              <button type="button" onClick={handleSvnUpdateForce}>
                强制更新此目录
              </button>
            ) : null}
          </>
        ) : null}

        {/* Git 操作 */}
        {isGit ? (
          <>
            <button type="button" onClick={handleGitStashPush}>
              Git Stash Push (暂存变更)
            </button>
            <button type="button" className="cmd-danger" onClick={() => setIsResetDialogOpen(true)}>
              Git Reset (soft)…
            </button>
          </>
        ) : null}

        <div className="context-menu-separator" />
        <button type="button" onClick={() => onIgnoreFile(path, vcsType)}>
          加入忽略
        </button>
        {(() => {
          const dotIdx = path.lastIndexOf(".");
          if (dotIdx > 0 && dotIdx < path.length - 1) {
            const ext = path.slice(dotIdx);
            return (
              <button type="button" onClick={() => onIgnoreFile(`*${ext}`, vcsType)}>
                忽略同后缀文件 (*{ext})
              </button>
            );
          }
          return null;
        })()}
      </div>

      {/* Reset 确认弹窗 */}
      <Modal open={isResetDialogOpen} onClose={() => setIsResetDialogOpen(false)} labelledBy="reset-confirm-title">
        <ModalHeading
          eyebrow="Git reset"
          title="确认重置？"
          titleId="reset-confirm-title"
          onClose={() => setIsResetDialogOpen(false)}
        />
        <div className="reset-confirm-body">
          <p>将执行 <code>git reset --soft HEAD</code>，取消当前所有暂存。文件内容不会丢失。</p>
          <p className="reset-confirm-path">{path}</p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setIsResetDialogOpen(false)}>取消</Button>
            <Button variant="default" onClick={handleGitResetSoft}>确认 Reset</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
