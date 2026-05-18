import type { ChangeStatus } from "../../lib/api";
import type { Translator } from "../../lib/i18n";

export function ChangeBadge({ status, t }: { status: ChangeStatus; t: Translator }) {
  return <span className={`change-badge ${status}`}>{t(`change.${status}` as any) ?? status}</span>;
}
