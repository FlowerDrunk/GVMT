import { useState } from "react";
import type { ChangeStatus, GitStashEntry, OperationResult, Repository, VcsType } from "../../lib/api";
import { gitReset, gitStashPush, svnRevert, svnResolve, svnResolveAccept, svnUpdateForce, type SvnAcceptType } from "../../lib/api";
import type { Translator } from "../../lib/i18n";
import { Modal, ModalHeading } from "../shared/Modal";
import { Button } from "../ui/button";
import { ForceUpdateConfirmDialog } from "../dialogs/ForceUpdateConfirmDialog";

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
  const [isForceUpdateConfirmOpen, setIsForceUpdateConfirmOpen] = useState(false);

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
        summary: t("contextMenu.revertFailed"),
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
        summary: t("contextMenu.resolveFailed"),
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
        summary: t("contextMenu.resolveFailed"),
        output: String(error),
        warning: String(error),
        missingSvnCli: false,
      });
    }
  }

  function handleSvnUpdateForce() {
    if (!repositoryId) return;
    setIsForceUpdateConfirmOpen(true);
  }

  async function handleForceUpdateExecute() {
    if (!repositoryId) return;
    setIsForceUpdateConfirmOpen(false);
    try {
      const result = await svnUpdateForce(repositoryId);
      onOperationResult(result);
    } catch (error) {
      onOperationResult({
        operation: "update",
        vcsType: "svn",
        success: false,
        summary: t("contextMenu.forceUpdateFailed"),
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
        summary: t("contextMenu.stashFailed"),
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
        summary: t("contextMenu.resetFailed"),
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
          {t("contextMenu.viewDiff")}
        </button>

        {isSvn ? (
          <>
            {isConflicted ? (
              <>
                <div className="context-menu-label">{t("contextMenu.conflictResolve")}</div>
                <button type="button" onClick={() => handleSvnResolveAccept("theirs-full")}>
                  {t("contextMenu.acceptTheirs")}
                </button>
                <button type="button" onClick={() => handleSvnResolveAccept("mine-full")}>
                  {t("contextMenu.acceptMine")}
                </button>
                <button type="button" onClick={() => handleSvnResolveAccept("base")}>
                  {t("contextMenu.acceptBase")}
                </button>
                <button type="button" onClick={handleSvnResolve}>
                  {t("contextMenu.markResolved")}
                </button>
                <div className="context-menu-separator" />
              </>
            ) : null}
            <button type="button" className="cmd-danger" onClick={handleSvnRevert}>
              SVN Revert
            </button>
            <button type="button" className="cmd-danger" onClick={handleSvnUpdateForce}>
              {t("contextMenu.forceUpdate")}
            </button>
          </>
        ) : null}

        {isGit ? (
          <>
            <button type="button" onClick={handleGitStashPush}>
              {t("contextMenu.gitStashPush")}
            </button>
            <button type="button" className="cmd-danger" onClick={() => setIsResetDialogOpen(true)}>
              {t("contextMenu.gitResetSoft")}
            </button>
          </>
        ) : null}

        <div className="context-menu-separator" />
        <button type="button" onClick={() => onIgnoreFile(path, vcsType)}>
          {t("contextMenu.addIgnore")}
        </button>
        {(() => {
          const dotIdx = path.lastIndexOf(".");
          if (dotIdx > 0 && dotIdx < path.length - 1) {
            const ext = path.slice(dotIdx);
            return (
              <button type="button" onClick={() => onIgnoreFile(`*${ext}`, vcsType)}>
                {t("contextMenu.ignoreExt", { ext })}
              </button>
            );
          }
          return null;
        })()}
      </div>

      <Modal open={isResetDialogOpen} onClose={() => setIsResetDialogOpen(false)} labelledBy="reset-confirm-title">
        <ModalHeading
          eyebrow="Git reset"
          title={t("contextMenu.resetTitle")}
          titleId="reset-confirm-title"
          onClose={() => setIsResetDialogOpen(false)}
          t={t}
        />
        <div className="reset-confirm-body">
          <p>{t("contextMenu.resetBody")}</p>
          <p className="reset-confirm-path">{path}</p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setIsResetDialogOpen(false)}>{t("ui.cancel")}</Button>
            <Button variant="default" onClick={handleGitResetSoft}>{t("contextMenu.confirmReset")}</Button>
          </div>
        </div>
      </Modal>

      <ForceUpdateConfirmDialog
        open={isForceUpdateConfirmOpen}
        onClose={() => setIsForceUpdateConfirmOpen(false)}
        onConfirm={handleForceUpdateExecute}
        t={t}
      />
    </>
  );
}
