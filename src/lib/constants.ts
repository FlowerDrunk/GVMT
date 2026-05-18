import type { ChangeItem, VcsType } from "./api";
import type { Translator } from "./i18n";

export function getVcsLabels(t: Translator): Record<VcsType, string> {
  return {
    git: t("vcs.git"),
    svn: t("vcs.svn"),
    mixed: t("vcs.mixed"),
    unknown: t("vcs.unknown"),
  };
}

export function changeKey(change: Pick<ChangeItem, "path" | "vcsType">) {
  return `${change.vcsType}:${change.path}`;
}

export function isCommittableChange(change: ChangeItem) {
  return change.status !== "conflicted" && change.status !== "missing" && change.status !== "unknown";
}
