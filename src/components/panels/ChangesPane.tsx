import { MouseEvent } from "react";
import type { ChangeItem, RepositoryStatus, VcsType } from "../../lib/api";
import type { ChangeTreeNode } from "../../lib/utils";
import type { TreeViewNode } from "../shared/TreeView";
import { TreeView } from "../shared/TreeView";

interface ChangesPaneProps {
  changedFiles: ChangeItem[];
  changeTreeViewNodes: TreeViewNode[];
  expandedChangePaths: Set<string>;
  renderChangeRow: (node: TreeViewNode, level: number, isExpanded: boolean) => React.ReactNode;
  onToggleChangeNode: (path: string) => void;
  changeNodeMap: Map<string, ChangeTreeNode>;
  selectedChange: ChangeItem | null;
  onSelectChange: (path: string, change: NonNullable<ChangeTreeNode["change"]>) => void;
  onContextMenu: (event: MouseEvent<HTMLButtonElement>, path: string, vcsType: VcsType) => void;
  repositoryStatus: RepositoryStatus | null;
  repositoryStats: { total: number; git: number; svn: number; unknown: number };
}

export function ChangesPane({
  changedFiles,
  changeTreeViewNodes,
  expandedChangePaths,
  renderChangeRow,
  onToggleChangeNode,
  changeNodeMap,
  selectedChange,
  onSelectChange,
  onContextMenu,
  repositoryStatus,
  repositoryStats,
}: ChangesPaneProps) {
  return (
    <aside className="changes-pane">
      <header className="changes-header">
        <button className="changes-title" type="button">
          变更状态
        </button>
        <input placeholder="筛选文件..." aria-label="筛选文件" />
      </header>
      {changedFiles.length > 0 ? (
        <div className="tree-list change-tree">
          <TreeView
            nodes={changeTreeViewNodes}
            expandedPaths={expandedChangePaths}
            renderRow={renderChangeRow}
            onToggle={onToggleChangeNode}
            onSelect={(node) => {
              const changeNode = changeNodeMap.get(node.path);
              if (changeNode?.change) {
                onSelectChange(node.path, changeNode.change);
              }
            }}
            onContextMenu={(node, event) => {
              const changeNode = changeNodeMap.get(node.path);
              if (changeNode?.change) {
                onContextMenu(event, node.path, changeNode.change.vcsType);
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
          <span data-state="active">功能分区布局</span>
        </div>
      </section>
    </aside>
  );
}
