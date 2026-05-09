import type { ChangeStatus, Repository, VcsType } from "../../lib/api";
import type { Translator } from "../../lib/i18n";

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
  t: Translator;
  onOpenDiff: (path: string, vcsType: VcsType, status?: ChangeStatus) => void;
  onIgnoreFile: (path: string, vcsType: VcsType) => void;
}

export function IgnoreContextMenuOverlay({
  menu,
  t,
  onOpenDiff,
  onIgnoreFile,
}: IgnoreContextMenuOverlayProps) {
  if (!menu) return null;

  return (
    <div
      className="context-menu"
      style={{ left: menu.x, top: menu.y }}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        disabled={!menu.data.status}
        onClick={() => onOpenDiff(menu.data.path, menu.data.vcsType, menu.data.status)}
      >
        {t("menu.viewDiff")}
      </button>
      <button
        type="button"
        onClick={() => onIgnoreFile(menu.data.path, menu.data.vcsType)}
      >
        {t("menu.ignoreFile")}
      </button>
    </div>
  );
}
