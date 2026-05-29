import { useMemo, useState } from "react";
import type { MouseEvent } from "react";
import type { ChangeItem, ChangeStatus, Repository, RepositoryStatus, VcsType } from "../../lib/api";
import type { Translator } from "../../lib/i18n";
import { getVcsLabels } from "../../lib/constants";
import { ChangeBadge } from "../shared/ChangeBadge";
import { EmptyState } from "../shared/EmptyState";
import { Modal, ModalHeading } from "../shared/Modal";
import { Button } from "../ui/button";

const STATUS_FILTERS = ["all", "added", "modified", "deleted", "untracked", "conflicted"] as const;
type FilterKey = (typeof STATUS_FILTERS)[number];

interface StatusPanelProps {
  repositoryStatus: RepositoryStatus | null;
  selectedRepository: Repository | undefined;
  isLoading: boolean;
  t: Translator;
  onLoadRepositoryStatus: () => void;
  onOpenSvnDownload: (target: "tortoise" | "sliksvn") => void;
  onSelectChange: (path: string, change: { status: ChangeStatus; vcsType: VcsType; staged: boolean }) => void;
  onOpenChangeDiff: (path: string, change: { status: ChangeStatus; vcsType: VcsType; staged: boolean }) => void;
  onContextMenu: (
    event: MouseEvent<HTMLButtonElement>,
    path: string,
    vcsType: VcsType,
    status: ChangeStatus,
  ) => void;
}

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "status.totalChanges",
  added: "status.added",
  modified: "status.modified",
  deleted: "status.deleted",
  untracked: "status.untracked",
  conflicted: "status.conflicted",
};

const SUMMARY_LABELS: Record<FilterKey, string> = {
  all: "status.totalChanges",
  added: "change.added",
  modified: "change.modified",
  deleted: "change.deleted",
  untracked: "change.untracked",
  conflicted: "change.conflicted",
};

export function StatusPanel({
  repositoryStatus,
  selectedRepository,
  isLoading,
  t,
  onLoadRepositoryStatus,
  onOpenSvnDownload,
  onSelectChange,
  onOpenChangeDiff,
  onContextMenu,
}: StatusPanelProps) {
  const [dialogFilter, setDialogFilter] = useState<FilterKey | null>(null);
  const changes = repositoryStatus?.changes ?? [];

  const filteredChanges = useMemo(() => {
    if (!dialogFilter || dialogFilter === "all") return changes;
    return changes.filter((c) => c.status === dialogFilter);
  }, [changes, dialogFilter]);

  const getCount = (key: FilterKey): number => {
    if (!repositoryStatus) return 0;
    const s = repositoryStatus.summary;
    switch (key) {
      case "all": return s.total;
      case "added": return s.added;
      case "modified": return s.modified;
      case "deleted": return s.deleted;
      case "untracked": return s.untracked;
      case "conflicted": return s.conflicted;
    }
  };

  return (
    <section className="panel status-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Workspace status</p>
          <h3>{t("status.workspaceStatus")}</h3>
        </div>
      </div>
      {repositoryStatus ? (
        <>
          <div className="change-summary" aria-label={t("status.workspaceStatus")}>
            {STATUS_FILTERS.map((key) => (
              <button
                key={key}
                className={`change-summary-chip ${dialogFilter === key ? "active" : ""}`}
                type="button"
                disabled={getCount(key) === 0}
                onClick={() => setDialogFilter(dialogFilter === key ? null : key)}
              >
                <span>{t(SUMMARY_LABELS[key] as any)}</span>
                <strong>{getCount(key)}</strong>
              </button>
            ))}
          </div>
          {repositoryStatus.warning ? (
            <div className="hint">
              <p>{repositoryStatus.warning}</p>
              {repositoryStatus.missingSvnCli ? (
                <div className="hint-actions">
                  <Button variant="secondary" onClick={() => onOpenSvnDownload("tortoise")}>{t("status.downloadTortoise")}</Button>
                  <Button variant="secondary" onClick={() => onOpenSvnDownload("sliksvn")}>{t("status.downloadSlikSvn")}</Button>
                </div>
              ) : null}
            </div>
          ) : null}
          {changes.length === 0 ? (
            <EmptyState compact title={t("status.clean")} description={t("status.noChanges")} />
          ) : null}
        </>
      ) : (
        <EmptyState compact title={t("status.notRefreshed")} description={t("status.notRefreshedDesc")} />
      )}

      <Modal open={dialogFilter !== null} onClose={() => setDialogFilter(null)} labelledBy="status-dialog-title">
        <ModalHeading
          eyebrow={t("status.workspaceStatus")}
          title={`${t(FILTER_LABELS[dialogFilter ?? "all"] as any)} (${filteredChanges.length})` as any}
          titleId="status-dialog-title"
          onClose={() => setDialogFilter(null)}
          t={t}
        />
        <div className="change-dialog-list">
          {filteredChanges.map((change) => (
            <button
              className="change-row"
              key={`${change.vcsType}-${change.status}-${change.path}`}
              type="button"
              onClick={() => { onSelectChange(change.path, { status: change.status, vcsType: change.vcsType, staged: change.staged }); setDialogFilter(null); }}
              onDoubleClick={() => onOpenChangeDiff(change.path, { status: change.status, vcsType: change.vcsType, staged: change.staged })}
              onContextMenu={(event) => onContextMenu(event, change.path, change.vcsType, change.status)}
            >
              <ChangeBadge status={change.status} t={t} isDir={change.isDir} />
              <span className="change-path">{change.path}</span>
              <span className="change-vcs">{getVcsLabels(t)[change.vcsType]}</span>
            </button>
          ))}
        </div>
      </Modal>
    </section>
  );
}
