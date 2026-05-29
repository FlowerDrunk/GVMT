import type { ChangeStatus } from "../../lib/api";
import type { Translator } from "../../lib/i18n";

export function ChangeBadge({ status, t, isDir }: { status: ChangeStatus; t: Translator; isDir?: boolean }) {
  return (
    <span className={`change-badge ${status}`}>
      {isDir ? (
        <svg className="change-folder-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      ) : null}
      <span>{t(`change.${status}` as any) ?? status}</span>
    </span>
  );
}
