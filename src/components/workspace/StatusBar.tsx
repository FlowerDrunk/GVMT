import type { ChangeStatus, Repository, VcsType } from "../../lib/api";

interface StatusBarProps {
  isLoading: boolean;
  status: string;
}

export function StatusBar({ isLoading, status }: StatusBarProps) {
  return (
    <footer className="statusbar">
      <span className={isLoading ? "status-dot busy" : "status-dot"} />
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
  onDeleteRequest: (repository: Repository) => void;
  onClose: () => void;
}

export function RepoContextMenuOverlay({
  menu,
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
        删除仓库记录
      </button>
    </div>
  );
}

interface IgnoreContextMenuOverlayProps {
  menu: ContextMenuState<{ path: string; vcsType: VcsType; status?: ChangeStatus }> | null;
  onOpenDiff: (path: string, vcsType: VcsType, status?: ChangeStatus) => void;
  onIgnoreFile: (path: string, vcsType: VcsType) => void;
}

export function IgnoreContextMenuOverlay({
  menu,
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
        查看 diff
      </button>
      <button
        type="button"
        onClick={() => onIgnoreFile(menu.data.path, menu.data.vcsType)}
      >
        忽略此文件
      </button>
    </div>
  );
}
