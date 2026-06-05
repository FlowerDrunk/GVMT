import { useMemo, useState } from "react";
import type { MouseEvent } from "react";
import type { ChangeItem, ChangeStatus, Repository, RepositoryStatus, VcsType } from "../../lib/api";
import type { Translator } from "../../lib/i18n";
import { getVcsLabels } from "../../lib/constants";
import { ChangeBadge } from "../shared/ChangeBadge";
import { Modal, ModalHeading } from "../shared/Modal";
import { Button } from "../ui/button";

const STATUS_FILTERS = ["all", "added", "modified", "deleted", "untracked", "conflicted"] as const;
type FilterKey = (typeof STATUS_FILTERS)[number];

interface StatusPanelProps {
  repositoryStatus: RepositoryStatus | null;
  selectedRepository: Repository | undefined;
  t: Translator;
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
  t,
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
        {repositoryStatus ? (
          (() => {
            const s = repositoryStatus.summary;
            if (repositoryStatus.warning) {
              return <span className="status-clean-badge warn" title={repositoryStatus.warning}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>警告</span>;
            }
            if (s.total === 0) {
              return <span className="status-clean-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>{t("status.clean")}</span>;
            }
            if (s.conflicted > 0) {
              return <span className="status-clean-badge danger"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>{s.conflicted} {t("change.conflicted")}</span>;
            }
            return <span className="status-clean-badge info">{s.total} 项变更</span>;
          })()
        ) : null}
      </div>
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
      {repositoryStatus?.warning ? (
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
