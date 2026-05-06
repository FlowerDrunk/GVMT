import { MouseEvent, useMemo, useState } from "react";
import type { ChangeItem, ChangeStatus, RepositoryStatus, VcsType } from "../../lib/api";
import type { ChangeTreeNode } from "../../lib/utils";
import type { TreeViewNode } from "../shared/TreeView";
import { TreeView } from "../shared/TreeView";
import { ChangeBadge } from "../shared/ChangeBadge";

interface ChangesPaneProps {
  changedFiles: ChangeItem[];
  changeTreeViewNodes: TreeViewNode[];
  expandedChangePaths: Set<string>;
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
  repositoryStats: { total: number; git: number; svn: number; unknown: number };
  defaultViewMode?: ViewMode;
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
  files: { path: string; name: string; status: ChangeStatus; vcsType: VcsType }[];
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
    group.files.push({ path: change.path, name, status: change.status, vcsType: change.vcsType });
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

export function ChangesPane({
  changedFiles,
  changeTreeViewNodes,
  expandedChangePaths,
  renderChangeRow,
  onToggleChangeNode,
  changeNodeMap,
  selectedChange,
  onSelectChange,
  onOpenChangeDiff,
  onContextMenu,
  repositoryStatus,
  repositoryStats,
  defaultViewMode = "flat",
}: ChangesPaneProps) {
  const [filterText, setFilterText] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);

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
      <header className="changes-header" style={{ display: "grid", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button className="changes-title" type="button">
            变更状态
          </button>
          <div className="view-toggle" style={{ display: "flex", gap: "2px" }}>
            <button
              className={`view-toggle-btn ${viewMode === "flat" ? "active" : ""}`}
              onClick={() => setViewMode("flat")}
              title="路径分组"
            >
              ▤
            </button>
            <button
              className={`view-toggle-btn ${viewMode === "tree" ? "active" : ""}`}
              onClick={() => setViewMode("tree")}
              title="树形展开"
            >
              ☰
            </button>
          </div>
        </div>
        <input
          placeholder="筛选文件..."
          aria-label="筛选文件"
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
                      {group.prefix}
                    </div>
                  ) : null}
                  {group.files.map((file) => (
                    <button
                      className={`change-row flat${selectedChange?.path === file.path ? " selected" : ""}`}
                      key={`${file.vcsType}-${file.status}-${file.path}`}
                      type="button"
                      onClick={() => onSelectChange(file.path, { status: file.status, vcsType: file.vcsType })}
                      onDoubleClick={() => onOpenChangeDiff(file.path, { status: file.status, vcsType: file.vcsType })}
                      onContextMenu={(event) => {
                        onContextMenu(event, file.path, file.vcsType, file.status);
                      }}
                    >
                      <ChangeBadge status={file.status} />
                      <span className="change-path">{file.name}</span>
                      <span className="change-vcs">{file.vcsType === "git" ? "Git" : file.vcsType === "svn" ? "SVN" : file.vcsType}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="changes-empty">
              <p>{filterText.trim() ? "没有匹配的文件" : "没有匹配的文件"}</p>
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
              <p>{filterText.trim() ? "没有匹配的文件" : "没有匹配的文件"}</p>
            </div>
          )
        )
      ) : (
        <div className="changes-empty">
          <p>{repositoryStatus ? "没有匹配的文件" : "尚未刷新状态"}</p>
        </div>
      )}

      <section className="changes-stats">
        <div>
          <span>总仓库</span>
          <strong>{repositoryStats.total}</strong>
        </div>
        <div>
          <span>Git</span>
          <strong>{repositoryStats.git}</strong>
        </div>
        <div>
          <span>SVN</span>
          <strong>{repositoryStats.svn}</strong>
        </div>
        <div>
          <span>待确认</span>
          <strong>{repositoryStats.unknown}</strong>
        </div>
      </section>

      <section className="changes-roadmap">
        <h3>当前阶段</h3>
        <div className="task-list compact">
          <span data-state="done">仓库文件浏览</span>
          <span data-state="completed">组件拆分 + Hook 提取</span>
          <span data-state="active">功能完善</span>
        </div>
      </section>
    </aside>
  );
}
