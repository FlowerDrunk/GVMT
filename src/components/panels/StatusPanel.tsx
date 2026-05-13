import { useState } from "react";
import type { MouseEvent } from "react";
import type { ChangeStatus, Repository, RepositoryStatus, VcsType } from "../../lib/api";
import type { Translator } from "../../lib/i18n";
import { VcsLabels } from "../../lib/constants";
import { ChangeBadge } from "../shared/ChangeBadge";
import { EmptyState } from "../shared/EmptyState";
import { Button } from "../ui/button";

const DEFAULT_LIMIT = 80;

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
  const [showAll, setShowAll] = useState(false);
  const changes = repositoryStatus?.changes ?? [];
  const totalChanges = changes.length;
  const isTruncated = totalChanges > DEFAULT_LIMIT;
  const displayedChanges = showAll || !isTruncated ? changes : changes.slice(0, DEFAULT_LIMIT);
  return (
    <section className="panel status-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Workspace status</p>
          <h3>{t("status.workspaceStatus")}</h3>
        </div>
        <Button variant="ghost" disabled={!selectedRepository || isLoading} onClick={onLoadRepositoryStatus}>
          {t("status.refresh")}
        </Button>
      </div>
      {repositoryStatus ? (
        <>
          <div className="change-summary" aria-label={t("status.workspaceStatus")}>
            <div>
              <span>{t("status.totalChanges")}</span>
              <strong>{repositoryStatus.summary.total}</strong>
            </div>
            <div>
              <span>{t("status.added")}</span>
              <strong>{repositoryStatus.summary.added}</strong>
            </div>
            <div>
              <span>{t("status.modified")}</span>
              <strong>{repositoryStatus.summary.modified}</strong>
            </div>
            <div>
              <span>{t("status.untracked")}</span>
              <strong>{repositoryStatus.summary.untracked}</strong>
            </div>
          </div>
          {repositoryStatus.warning ? (
            <div className="hint">
              <p>{repositoryStatus.warning}</p>
              {repositoryStatus.missingSvnCli ? (
                <div className="hint-actions">
                  <Button variant="secondary" onClick={() => onOpenSvnDownload("tortoise")}>
                    {t("status.downloadTortoise")}
                  </Button>
                  <Button variant="secondary" onClick={() => onOpenSvnDownload("sliksvn")}>
                    {t("status.downloadSlikSvn")}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
          {repositoryStatus.changes.length === 0 ? (
            <EmptyState
              compact
              title={repositoryStatus.warning ? t("status.notRefreshed") : t("status.clean")}
              description={repositoryStatus.warning ?? t("status.noChanges")}
            />
          ) : (
            <div className="change-list">
              {displayedChanges.map((change) => (
                <button
                  className="change-row"
                  key={`${change.vcsType}-${change.status}-${change.path}`}
                  type="button"
                  onClick={() => onSelectChange(change.path, { status: change.status, vcsType: change.vcsType, staged: change.staged })}
                  onDoubleClick={() => onOpenChangeDiff(change.path, { status: change.status, vcsType: change.vcsType, staged: change.staged })}
                  onContextMenu={(event) => onContextMenu(event, change.path, change.vcsType, change.status)}
                >
                  <ChangeBadge status={change.status} />
                  <span className="change-path">{change.path}</span>
                  <span className="change-vcs">{VcsLabels[change.vcsType]}</span>
                </button>
              ))}
              {isTruncated && (
                <button
                  className="change-show-more"
                  type="button"
                  onClick={() => setShowAll((prev) => !prev)}
                >
                  {showAll ? t("status.showLess") : `${t("status.showAll")} (${totalChanges})`}
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <EmptyState
          compact
          title={isLoading ? "加载中..." : t("status.notRefreshed")}
          description={isLoading ? "正在获取仓库状态" : t("status.notRefreshedDesc")}
        />
      )}
    </section>
  );
}
