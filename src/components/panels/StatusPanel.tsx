import type { MouseEvent } from "react";
import type { ChangeStatus, Repository, RepositoryStatus, VcsType } from "../../lib/api";
import { VcsLabels } from "../../lib/constants";
import { ChangeBadge } from "../shared/ChangeBadge";
import { EmptyState } from "../shared/EmptyState";

interface StatusPanelProps {
  repositoryStatus: RepositoryStatus | null;
  selectedRepository: Repository | undefined;
  isLoading: boolean;
  onLoadRepositoryStatus: () => void;
  onOpenSvnDownload: (target: "tortoise" | "sliksvn") => void;
  onSelectChange: (path: string, change: { status: ChangeStatus; vcsType: VcsType }) => void;
  onOpenChangeDiff: (path: string, change: { status: ChangeStatus; vcsType: VcsType }) => void;
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
  onLoadRepositoryStatus,
  onOpenSvnDownload,
  onSelectChange,
  onOpenChangeDiff,
  onContextMenu,
}: StatusPanelProps) {
  return (
    <section className="panel status-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Workspace status</p>
          <h3>工作区状态</h3>
        </div>
        <button
          className="ghost-button"
          type="button"
          disabled={!selectedRepository || isLoading}
          onClick={onLoadRepositoryStatus}
        >
          刷新
        </button>
      </div>
      {repositoryStatus ? (
        <>
          <div className="change-summary" aria-label="变更统计">
            <div>
              <span>总变更</span>
              <strong>{repositoryStatus.summary.total}</strong>
            </div>
            <div>
              <span>新增</span>
              <strong>{repositoryStatus.summary.added}</strong>
            </div>
            <div>
              <span>修改</span>
              <strong>{repositoryStatus.summary.modified}</strong>
            </div>
            <div>
              <span>未跟踪</span>
              <strong>{repositoryStatus.summary.untracked}</strong>
            </div>
          </div>
          {repositoryStatus.warning ? (
            <div className="hint">
              <p>{repositoryStatus.warning}</p>
              {repositoryStatus.missingSvnCli ? (
                <div className="hint-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => onOpenSvnDownload("tortoise")}
                  >
                    下载 / 修改 TortoiseSVN
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => onOpenSvnDownload("sliksvn")}
                  >
                    下载 SlikSVN
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {repositoryStatus.changes.length === 0 ? (
            <EmptyState
              compact
              title={repositoryStatus.warning ? "暂无可展示变更" : "工作区干净"}
              description={repositoryStatus.warning ?? "没有检测到新增、修改、删除或冲突文件。"}
            />
          ) : (
            <div className="change-list">
              {repositoryStatus.changes.slice(0, 80).map((change) => (
                <button
                  className="change-row"
                  key={`${change.vcsType}-${change.status}-${change.path}`}
                  type="button"
                  onClick={() => onSelectChange(change.path, { status: change.status, vcsType: change.vcsType })}
                  onDoubleClick={() => onOpenChangeDiff(change.path, { status: change.status, vcsType: change.vcsType })}
                  onContextMenu={(event) => onContextMenu(event, change.path, change.vcsType, change.status)}
                >
                  <ChangeBadge status={change.status} />
                  <span className="change-path">{change.path}</span>
                  <span className="change-vcs">{VcsLabels[change.vcsType]}</span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <EmptyState
          compact
          title="尚未刷新状态"
          description="选择仓库后点击刷新状态，这里会显示 Git / SVN 的变更摘要和文件列表。"
        />
      )}
    </section>
  );
}
