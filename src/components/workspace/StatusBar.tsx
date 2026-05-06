import type { Repository } from "../../lib/api";

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
  menu: ContextMenuState<{ path: string; vcsType: string }> | null;
  onIgnoreFile: (path: string, vcsType: string) => void;
}

export function IgnoreContextMenuOverlay({
  menu,
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
        onClick={() => onIgnoreFile(menu.data.path, menu.data.vcsType)}
      >
        忽略此文件
      </button>
    </div>
  );
}
