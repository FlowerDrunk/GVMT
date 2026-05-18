import { CSSProperties, memo, MouseEvent, ReactNode } from "react";

export interface TreeViewNode {
  name: string;
  path: string;
  children: TreeViewNode[];
  isDirectory?: boolean;
}

interface TreeViewProps {
  nodes: TreeViewNode[];
  level?: number;
  expandedPaths: Set<string>;
  renderRow: (node: TreeViewNode, level: number, isExpanded: boolean) => ReactNode;
  onToggle: (path: string) => void;
  onSelect?: (node: TreeViewNode) => void;
  onDoubleClick?: (node: TreeViewNode) => void;
  onContextMenu?: (node: TreeViewNode, event: MouseEvent<HTMLButtonElement>) => void;
  getRowClassName?: (node: TreeViewNode) => string;
  rowClassName?: string;
}

export const TreeView = memo(function TreeView({
  nodes,
  level = 0,
  expandedPaths,
  renderRow,
  onToggle,
  onSelect,
  onDoubleClick,
  onContextMenu,
  getRowClassName,
  rowClassName = "tree-row",
}: TreeViewProps) {
  return (
    <>
      {nodes.map((node) => {
        const isDirectory = node.isDirectory ?? node.children.length > 0;
        const isExpanded = expandedPaths.has(node.path);

        return (
          <div className="tree-node" key={node.path}>
            <button
              className={`${rowClassName} ${isDirectory ? "directory" : "file"}${getRowClassName ? ` ${getRowClassName(node)}` : ""}`}
              type="button"
              style={{ "--tree-level": level } as CSSProperties}
              onClick={() => {
                if (isDirectory) {
                  onToggle(node.path);
                } else {
                  onSelect?.(node);
                }
              }}
              onDoubleClick={
                isDirectory ? undefined : () => onDoubleClick?.(node)
              }
              onContextMenu={
                isDirectory ? undefined : (event) => onContextMenu?.(node, event)
              }
            >
              <span className="tree-toggle" aria-hidden="true">
                {isDirectory ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`tree-chevron ${isExpanded ? "expanded" : ""}`}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="tree-file-icon">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                )}
              </span>
              {renderRow(node, level, isExpanded)}
            </button>
            {isDirectory && isExpanded ? (
              <TreeView
                nodes={node.children}
                level={level + 1}
                expandedPaths={expandedPaths}
                renderRow={renderRow}
                onToggle={onToggle}
                onSelect={onSelect}
                onDoubleClick={onDoubleClick}
                onContextMenu={onContextMenu}
                getRowClassName={getRowClassName}
                rowClassName={rowClassName}
              />
            ) : null}
          </div>
                );
      })}
    </>
  );
});
