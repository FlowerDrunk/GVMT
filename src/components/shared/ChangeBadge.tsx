import type { ChangeStatus } from "../../lib/api";
import type { Translator } from "../../lib/i18n";

const changeLabels: Record<string, string> = {
  added: "新增",
  modified: "修改",
  deleted: "删除",
  renamed: "重命名",
  untracked: "未跟踪",
  conflicted: "冲突",
  missing: "缺失",
  unknown: "未知",
};

export function ChangeBadge({ status }: { status: ChangeStatus }) {
  return <span className={`change-badge ${status}`}>{changeLabels[status] ?? status}</span>;
}
