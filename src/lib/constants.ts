import type { ChangeItem, VcsType } from "./api";

export const VcsLabels: Record<VcsType, string> = {
  git: "Git",
  svn: "SVN",
  mixed: "Git + SVN",
  unknown: "未知",
};

export function changeKey(change: Pick<ChangeItem, "path" | "vcsType">) {
  return `${change.vcsType}:${change.path}`;
}

export function isCommittableChange(change: ChangeItem) {
  return change.status !== "conflicted" && change.status !== "unknown";
}
