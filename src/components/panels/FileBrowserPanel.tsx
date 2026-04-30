import { MouseEvent, ReactNode } from "react";
import type { Repository, RepositoryDirectory, VcsType } from "../../lib/api";
import type { TreeViewNode } from "../shared/TreeView";
import { EmptyState } from "../shared/EmptyState";
import { TreeView } from "../shared/TreeView";

interface FileBrowserPanelProps {
  repositoryFiles: RepositoryDirectory | null;
  selectedRepository: Repository | undefined;
  isFileBrowserLoading: boolean;
  onLoadRepositoryFiles: (path: string) => void;
  breadcrumbs: { name: string; path: string }[];
  fileTreeNodes: TreeViewNode[];
  expandedFilePaths: Set<string>;
  renderFileRow: (node: TreeViewNode, level: number, isExpanded: boolean) => ReactNode;
  onFileTreeToggle: (path: string) => void;
  onContextMenu: (event: MouseEvent<HTMLButtonElement>, path: string, vcsType: VcsType) => void;
}

export function FileBrowserPanel({
  repositoryFiles,
  selectedRepository,
  isFileBrowserLoading,
  onLoadRepositoryFiles,
  breadcrumbs,
  fileTreeNodes,
  expandedFilePaths,
  renderFileRow,
  onFileTreeToggle,
  onContextMenu,
}: FileBrowserPanelProps) {
  return (
    <section className="panel file-browser-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Repository files</p>
          <h3>文件浏览</h3>
        </div>
        <button
          className="ghost-button"
          type="button"
          disabled={!selectedRepository || isFileBrowserLoading}
          onClick={() => onLoadRepositoryFiles(repositoryFiles?.path ?? "")}
        >
          刷新
        </button>
      </div>
      <div className="file-toolbar">
        <button
          className="secondary-button"
          type="button"
          disabled={repositoryFiles?.parentPath === null || repositoryFiles?.parentPath === undefined || isFileBrowserLoading}
          onClick={() => onLoadRepositoryFiles(repositoryFiles?.parentPath ?? "")}
        >
          返回上级
        </button>
        <div className="breadcrumb" aria-label="当前路径">
          <button type="button" onClick={() => onLoadRepositoryFiles("")} disabled={isFileBrowserLoading}>
            根目录
          </button>
          {breadcrumbs.map((breadcrumb) => (
            <button
              type="button"
              key={breadcrumb.path}
              onClick={() => onLoadRepositoryFiles(breadcrumb.path)}
              disabled={isFileBrowserLoading}
            >
              {breadcrumb.name}
            </button>
          ))}
        </div>
      </div>
      {repositoryFiles ? (
        repositoryFiles.entries.length === 0 ? (
          <EmptyState compact title="目录为空" description="当前目录下没有可展示的文件或文件夹。" />
        ) : (
          <div className="tree-list file-tree">
            <TreeView
              nodes={fileTreeNodes}
              expandedPaths={expandedFilePaths}
              renderRow={renderFileRow}
              onToggle={onFileTreeToggle}
              onContextMenu={(node, event) => {
                if (!selectedRepository) return;
                onContextMenu(event, node.path, selectedRepository.vcsType === "svn" ? "svn" : "git");
              }}
              rowClassName="tree-row file-tree-row"
            />
          </div>
        )
      ) : (
        <EmptyState compact title={selectedRepository ? "尚未加载文件" : "未选择仓库"} description={selectedRepository ? "点击刷新读取当前仓库目录。" : "从左侧选择一个仓库后，这里会显示文件列表。"} />
      )}
    </section>
  );
}
