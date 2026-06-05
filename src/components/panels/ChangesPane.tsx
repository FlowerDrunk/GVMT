import { memo, MouseEvent, useMemo, useState } from "react";
import type { ChangeItem, ChangeStatus, RepositoryStatus, VcsType } from "../../lib/api";
import type { Translator } from "../../lib/i18n";
import type { ChangeTreeNode } from "../../lib/utils";
import type { TreeViewNode } from "../shared/TreeView";
import { TreeView } from "../shared/TreeView";
import { ChangeBadge } from "../shared/ChangeBadge";
import { Modal, ModalHeading } from "../shared/Modal";
import { Button } from "../ui/button";

interface ChangesPaneProps {
  changedFiles: ChangeItem[];
  changeTreeViewNodes: TreeViewNode[];
  expandedChangePaths: Set<string>;
  t: Translator;
  renderChangeRow: (node: TreeViewNode, level: number, isExpanded: boolean) => React.ReactNode;
  onToggleChangeNode: (path: string) => void;
  changeNodeMap: Map<string, ChangeTreeNode>;
  selectedChange: ChangeItem | null;
  onSelectChange: (path: string, change: NonNullable<ChangeTreeNode["change"]>) => void;
  onOpenChangeDiff: (path: string, change: NonNullable<ChangeTreeNode["change"]>) => void;
  onContextMenu: (
    event: MouseEvent<HTMLButtonElement>,
    path: string,
    vcsType: VcsType,
    status: ChangeStatus,
  ) => void;
  repositoryStatus: RepositoryStatus | null;
  defaultViewMode?: ViewMode;
  onStageAll?: () => void;
  onUnstageAll?: () => void;
  onCommitStaged?: () => void;
  onUnstageFile?: (path: string) => void;
}

function filterTreeNodes(nodes: TreeViewNode[], query: string): TreeViewNode[] {
  if (!query.trim()) return nodes;
  const lower = query.toLowerCase();
  function matches(node: TreeViewNode): TreeViewNode | null {
    const nameMatch = node.name.toLowerCase().includes(lower);
    const filteredChildren = node.children.map(matches).filter((n): n is TreeViewNode => n !== null);
    if (nameMatch || filteredChildren.length > 0) {
      return { ...node, children: filteredChildren.length > 0 ? filteredChildren : node.children };
    }
    return null;
  }
  return nodes.map(matches).filter((n): n is TreeViewNode => n !== null);
}

function collectAllPaths(nodes: TreeViewNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    paths.push(node.path);
    paths.push(...collectAllPaths(node.children));
  }
  return paths;
}

interface FlatGroup {
  prefix: string;
  files: { path: string; name: string; status: ChangeStatus; vcsType: VcsType; staged: boolean; isDir?: boolean }[];
}

function buildFlatGroups(changes: ChangeItem[]): FlatGroup[] {
  const groupMap = new Map<string, FlatGroup>();

  for (const change of changes) {
    const clean = change.path.replace(/\\/g, "/");
    const lastSlash = clean.lastIndexOf("/");
    const dir = lastSlash > 0 ? clean.substring(0, lastSlash) : "";
    const name = lastSlash > 0 ? clean.substring(lastSlash + 1) : clean;
    const prefix = dir ? `${dir}/` : "";

    let group = groupMap.get(prefix);
    if (!group) {
      group = { prefix, files: [] };
      groupMap.set(prefix, group);
    }
    group.files.push({ path: change.path, name, status: change.status, vcsType: change.vcsType, staged: change.staged, isDir: change.isDir });
  }

  const groups = [...groupMap.values()];

  groups.sort((a, b) => {
    const aDir = a.prefix.split("/").length;
    const bDir = b.prefix.split("/").length;
    if (aDir !== bDir) return aDir - bDir;
    return a.prefix.localeCompare(b.prefix);
  });

  for (const group of groups) {
    group.files.sort((a, b) => a.name.localeCompare(b.name));
  }

  return groups;
}

type ViewMode = "tree" | "flat";

function FlatViewIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </svg>
  );
}

function TreeViewIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5h6" />
      <path d="M4 12h6" />
      <path d="M4 19h6" />
      <path d="M14 12h6" />
      <path d="M10 5v14" />
      <path d="M10 12h4" />
    </svg>
  );
}

export const ChangesPane = memo(function ChangesPane({
  changedFiles,
  changeTreeViewNodes,
  expandedChangePaths,
  t,
  renderChangeRow,
  onToggleChangeNode,
  changeNodeMap,
  selectedChange,
  onSelectChange,
  onOpenChangeDiff,
  onContextMenu,
  repositoryStatus,
  defaultViewMode = "flat",
  onStageAll,
  onUnstageAll,
  onCommitStaged,
  onUnstageFile,
}: ChangesPaneProps) {
  const [filterText, setFilterText] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const [isStagedDialogOpen, setIsStagedDialogOpen] = useState(false);

  const flatGroups = useMemo(() => buildFlatGroups(changedFiles), [changedFiles]);

  const filteredGroups = useMemo(() => {
    if (!filterText.trim()) return flatGroups;
    const lower = filterText.toLowerCase();
    return flatGroups
      .map((g) => ({
        ...g,
        files: g.files.filter((f) => f.name.toLowerCase().includes(lower) || f.path.toLowerCase().includes(lower)),
      }))
      .filter((g) => g.files.length > 0);
  }, [flatGroups, filterText]);

  const filteredNodes = useMemo(
    () => filterTreeNodes(changeTreeViewNodes, filterText),
    [changeTreeViewNodes, filterText],
  );

  const effectiveExpandedPaths = useMemo(() => {
    if (!filterText.trim()) return expandedChangePaths;
    const autoExpand = new Set(expandedChangePaths);
    for (const path of collectAllPaths(filteredNodes)) {
      autoExpand.add(path);
    }
    return autoExpand;
  }, [expandedChangePaths, filteredNodes, filterText]);

  return (
    <aside className="changes-pane">
      <header className="changes-header">
        <div className="changes-header-row">
          <button className="changes-title" type="button">
            {t("changes.title")}
          </button>
          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${viewMode === "flat" ? "active" : ""}`}
              onClick={() => setViewMode("flat")}
              title={t("changes.flatView")}
            >
              <FlatViewIcon />
            </button>
            <button
              className={`view-toggle-btn ${viewMode === "tree" ? "active" : ""}`}
              onClick={() => setViewMode("tree")}
              title={t("changes.treeView")}
            >
              <TreeViewIcon />
            </button>
          </div>
        </div>
        <input
          placeholder={t("changes.filter")}
          aria-label={t("changes.filter")}
          value={filterText}
          onChange={(event) => setFilterText(event.currentTarget.value)}
        />
      </header>

      {changedFiles.length > 0 ? (
        viewMode === "flat" ? (
          filteredGroups.length > 0 ? (
            <div className="change-flat-list">
              {filteredGroups.map((group) => (
                <div className="flat-group" key={group.prefix}>
                  {group.prefix ? (
                    <div className="flat-group-header" title={group.prefix}>
                      <svg className="flat-folder-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                      <span>{group.prefix}</span>
                    </div>
                  ) : null}
                  {group.files.map((file) => (
                    <button
                      className={`change-row flat${selectedChange?.path === file.path ? " selected" : ""}`}
                      key={`${file.vcsType}-${file.status}-${file.path}`}
                      type="button"
                      onClick={() => onSelectChange(file.path, { status: file.status, vcsType: file.vcsType, staged: file.staged })}
                      onDoubleClick={() => onOpenChangeDiff(file.path, { status: file.status, vcsType: file.vcsType, staged: file.staged })}
                      onContextMenu={(event) => {
                        onContextMenu(event, file.path, file.vcsType, file.status);
                      }}
                    >
                      <ChangeBadge status={file.status} t={t} isDir={file.isDir} />
                      <span className="change-path">{group.prefix ? file.name : file.path}</span>
                      <span className="change-vcs">{file.vcsType === "git" ? "Git" : file.vcsType === "svn" ? "SVN" : file.vcsType}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="changes-empty">
              <p>{filterText.trim() ? t("changes.noMatch") : t("changes.noMatch")}</p>
            </div>
          )
        ) : (
          filteredNodes.length > 0 ? (
            <div className="tree-list change-tree">
              <TreeView
                nodes={filteredNodes}
                expandedPaths={effectiveExpandedPaths}
                renderRow={renderChangeRow}
                onToggle={onToggleChangeNode}
                onSelect={(node) => {
                  const changeNode = changeNodeMap.get(node.path);
                  if (changeNode?.change) {
                    onSelectChange(node.path, changeNode.change);
                  }
                }}
                onDoubleClick={(node) => {
                  const changeNode = changeNodeMap.get(node.path);
                  if (changeNode?.change) {
                    onOpenChangeDiff(node.path, changeNode.change);
                  }
                }}
                onContextMenu={(node, event) => {
                  const changeNode = changeNodeMap.get(node.path);
                  if (changeNode?.change) {
                    onContextMenu(event, node.path, changeNode.change.vcsType, changeNode.change.status);
                  }
                }}
                getRowClassName={(node) => {
                  const changeNode = changeNodeMap.get(node.path);
                  return selectedChange?.path === node.path && selectedChange?.vcsType === changeNode?.change?.vcsType
                    ? "selected"
                    : "";
                }}
                rowClassName="tree-row change-tree-row"
              />
            </div>
          ) : (
            <div className="changes-empty">
              <p>{filterText.trim() ? t("changes.noMatch") : t("changes.noMatch")}</p>
            </div>
          )
        )
      ) : (
        <div className="changes-empty">
          <p>{repositoryStatus ? t("changes.noMatch") : t("changes.notRefreshed")}</p>
        </div>
      )}

      {repositoryStatus?.vcsType !== "svn" && (repositoryStatus?.vcsType === "git" || repositoryStatus?.vcsType === "mixed") ? (
        <section className="changes-staging">
          <h3>{t("changes.stagingArea")}</h3>
          <div className="staging-stats">
            <button
              className="staging-stat clickable"
              type="button"
              onClick={() => setIsStagedDialogOpen(true)}
            >
              <span className="staging-label">{t("changes.staged")}</span>
              <strong className="staging-count staged">{changedFiles.filter((f) => f.staged).length}</strong>
            </button>
            <div className="staging-stat">
              <span className="staging-label">{t("changes.unstaged")}</span>
              <strong className="staging-count unstaged">{changedFiles.filter((f) => !f.staged).length}</strong>
            </div>
          </div>
          <div className="staging-actions">
            {onStageAll && (
              <button className="staging-btn" type="button" onClick={onStageAll}>
                {t("changes.stageAll")}
              </button>
            )}
            {onUnstageAll && (
              <button className="staging-btn" type="button" onClick={onUnstageAll}>
                {t("changes.unstageAll")}
              </button>
            )}
            {onCommitStaged && (
              <button className="staging-btn primary" type="button" onClick={onCommitStaged}>
                {t("changes.commitStaged")}
              </button>
            )}
          </div>
        </section>
      ) : null}

      <Modal open={isStagedDialogOpen} onClose={() => setIsStagedDialogOpen(false)} className="staged-files-dialog">
        <ModalHeading
          eyebrow="Git Staging"
          title={t("changes.stagedFiles")}
          titleId="staged-dialog-title"
          onClose={() => setIsStagedDialogOpen(false)}
          t={t}
        />
        <div className="staged-files-list">
          {changedFiles.filter((f) => f.staged).length === 0 ? (
            <p className="staged-files-empty">{t("changes.noStagedFiles")}</p>
          ) : (
            changedFiles
              .filter((f) => f.staged)
              .map((file) => (
                <div className="staged-file-row" key={`${file.vcsType}-${file.path}`}>
                  <ChangeBadge status={file.status} t={t} isDir={file.isDir} />
                  <span className="staged-file-path">{file.path}</span>
                  {onUnstageFile && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        onUnstageFile(file.path);
                      }}
                    >
                      {t("changes.unstage")}
                    </Button>
                  )}
                </div>
              ))
          )}
        </div>
        <div className="staged-dialog-actions">
          {onUnstageAll && (
            <Button variant="outline" onClick={() => { onUnstageAll(); }}>
              {t("changes.unstageAll")}
            </Button>
          )}
          {onCommitStaged && (
            <Button variant="default" onClick={() => { onCommitStaged(); setIsStagedDialogOpen(false); }}>
              {t("changes.commitStaged")}
            </Button>
          )}
        </div>
          </Modal>
    </aside>
  );
});
