import { CSSProperties, MouseEvent, ReactNode } from "react";

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
  onContextMenu?: (node: TreeViewNode, event: MouseEvent<HTMLButtonElement>) => void;
  getRowClassName?: (node: TreeViewNode) => string;
  rowClassName?: string;
}

export function TreeView({
  nodes,
  level = 0,
  expandedPaths,
  renderRow,
  onToggle,
  onSelect,
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
              onContextMenu={
                isDirectory ? undefined : (event) => onContextMenu?.(node, event)
              }
            >
              <span className="tree-toggle" aria-hidden="true">
                {isDirectory ? (isExpanded ? "v" : ">") : "-"}
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
}
