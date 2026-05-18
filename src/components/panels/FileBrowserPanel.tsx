import { MouseEvent, ReactNode, useEffect, useRef, useState } from "react";
import type {
  GitHubEntry,
  Repository,
  RepositoryDirectory,
  RepositoryFilePreview,
  SvnRemoteDirectory,
  SvnRemoteEntry,
  VcsType,
} from "../../lib/api";
import {
  ghListDirectory,
  ghReadFile,
  svnRemoteList,
  svnRemoteCat,
} from "../../lib/api";
import type { Translator } from "../../lib/i18n";
import type { TreeViewNode } from "../shared/TreeView";
import { EmptyState } from "../shared/EmptyState";
import { TreeView } from "../shared/TreeView";
import { formatFileSize, formatModifiedAt } from "../../lib/utils";
import { Modal, ModalHeading } from "../shared/Modal";
import { CodeBlock } from "../shared/CodeBlock";
import { Button } from "../ui/button";
import fileIconUrl from "../../../src-tauri/icons/file.png";
import folderIconUrl from "../../../src-tauri/icons/folder.png";

type FileSource = "local" | "remote";

interface FileBrowserPanelProps {
  repositoryFiles: RepositoryDirectory | null;
  selectedRepository: Repository | undefined;
  isFileBrowserLoading: boolean;
  t: Translator;
  onLoadRepositoryFiles: (path: string) => void;
  breadcrumbs: { name: string; path: string }[];
  fileTreeNodes: TreeViewNode[];
  expandedFilePaths: Set<string>;
  isFilePreviewOpen: boolean;
  selectedFilePreview: RepositoryFilePreview | null;
  isFilePreviewLoading: boolean;
  renderFileRow: (node: TreeViewNode, level: number, isExpanded: boolean) => ReactNode;
  onFileTreeToggle: (path: string) => void;
  onFileTreeOpen: (path: string) => void;
  onCloseFilePreview: () => void;
  onContextMenu: (event: MouseEvent<HTMLButtonElement>, path: string, vcsType: VcsType) => void;
}

interface RemoteEntry {
  name: string;
  path: string;
  entryType: "file" | "directory";
  size: number | null;
}

interface RemoteBrowserState {
  currentPath: string;
  parentPath: string | null;
  breadcrumbs: { name: string; path: string }[];
}

function isSvnUrl(url: string): boolean {
  return url.startsWith("svn://") || url.startsWith("svn+ssh://");
}

function buildRemoteUrl(remoteUrl: string, path: string): string {
  const base = remoteUrl.replace(/\/$/, "");
  if (!path || path === "/" || path === "") return base;
  return `${base}/${path.replace(/^\//, "")}`;
}

export function FileBrowserPanel({
  repositoryFiles,
  selectedRepository,
  isFileBrowserLoading,
  t,
  onLoadRepositoryFiles,
  breadcrumbs,
  fileTreeNodes,
  expandedFilePaths,
  isFilePreviewOpen,
  selectedFilePreview,
  isFilePreviewLoading,
  renderFileRow,
  onFileTreeToggle,
  onFileTreeOpen,
  onCloseFilePreview,
  onContextMenu,
}: FileBrowserPanelProps) {
  const [source, setSource] = useState<FileSource>("local");
  const [remoteState, setRemoteState] = useState<RemoteBrowserState | null>(null);
  const [isRemoteLoading, setIsRemoteLoading] = useState(false);
  const [remoteBrowseError, setRemoteBrowseError] = useState<string | null>(null);
  const [remotePreview, setRemotePreview] = useState<{ name: string; path: string; content: string; size: number; isBinary: boolean } | null>(null);
  const [isRemotePreviewOpen, setIsRemotePreviewOpen] = useState(false);
  const [isRemotePreviewLoading, setIsRemotePreviewLoading] = useState(false);
  const [remotePreviewError, setRemotePreviewError] = useState<string | null>(null);
  const [remoteExpandedPaths, setRemoteExpandedPaths] = useState<Set<string>>(new Set());
  // nodeMap holds all loaded entries keyed by parent path; "" = root
  const nodeMapRef = useRef<Map<string, RemoteEntry[]>>(new Map());

  const remoteUrl = selectedRepository?.remoteUrl;
  const isSvn = selectedRepository?.vcsType === "svn" || (remoteUrl ? isSvnUrl(remoteUrl) : false);
  const repoId = selectedRepository?.id;

  // 切换仓库时清理远程浏览状态并切回本地
  useEffect(() => {
    setRemoteState(null);
    setRemotePreview(null);
    setRemotePreviewError(null);
    setRemoteBrowseError(null);
    setRemoteExpandedPaths(new Set());
    nodeMapRef.current.clear();
    setSource("local");
  }, [repoId]);

  function buildCrumbs(path: string): { name: string; path: string }[] {
    const crumbs: { name: string; path: string }[] = [{ name: "根目录", path: "" }];
    const parts = path.split("/").filter(Boolean);
    let accumulated = "";
    for (const part of parts) {
      accumulated = accumulated ? `${accumulated}/${part}` : part;
      crumbs.push({ name: part, path: accumulated });
    }
    return crumbs;
  }

  async function loadRemoteChildren(parentPath: string): Promise<RemoteEntry[]> {
    if (!remoteUrl) return [];
    if (!isSvn) {
      const result = await ghListDirectory(remoteUrl, parentPath);
      return result.entries.map((e: GitHubEntry) => ({
        name: e.name,
        path: e.path,
        entryType: e.entryType === "directory" ? "directory" : "file",
        size: e.size ?? null,
      }));
    } else {
      const url = buildRemoteUrl(remoteUrl, parentPath);
      const result: SvnRemoteDirectory = await svnRemoteList(url);
      return result.entries.map((e: SvnRemoteEntry) => ({
        name: e.name,
        path: parentPath ? `${parentPath}/${e.name}` : e.name,
        entryType: e.entryType,
        size: null,
      }));
    }
  }

  // 加载根级目录，初始化 tree
  async function handleRemoteBrowse(path: string) {
    if (!remoteUrl) return;
    setRemoteBrowseError(null);
    setIsRemoteLoading(true);
    try {
      const entries = await loadRemoteChildren(path);
      const parentPath = path === "" || path === "/" ? null : path.substring(0, path.lastIndexOf("/")) || "";
      // 更新 nodeMap：path 目录下的 children
      nodeMapRef.current.set(path, entries);
      setRemoteState({ currentPath: path, parentPath, breadcrumbs: buildCrumbs(path) });
    } catch (error) {
      setRemoteState(null);
      setRemoteBrowseError(String(error));
    } finally {
      setIsRemoteLoading(false);
    }
  }

  async function handleRemoteFileOpen(entry: RemoteEntry) {
    if (!remoteUrl) return;
    setRemotePreviewError(null);
    setIsRemotePreviewLoading(true);
    setIsRemotePreviewOpen(true);
    try {
      if (!isSvn) {
        const result = await ghReadFile(remoteUrl, entry.path);
        setRemotePreview({
          name: result.name,
          path: result.path,
          content: result.content,
          size: result.size,
          isBinary: result.isBinary,
        });
      } else {
        const url = buildRemoteUrl(remoteUrl, entry.path);
        const content = await svnRemoteCat(url);
        setRemotePreview({
          name: entry.name,
          path: entry.path,
          content,
          size: content.length,
          isBinary: false,
        });
      }
    } catch (error) {
      setRemotePreview(null);
      setRemotePreviewError(String(error));
    } finally {
      setIsRemotePreviewLoading(false);
    }
  }

  const isLoading = isFileBrowserLoading || isRemoteLoading;

  // 从 nodeMap 非递归构建 TreeViewNode[]，只构建当前路径下的一层
  // 目录节点仅标记 children 数量（展开的子节点由 TreeView 后续渲染时动态构造）
  function buildTreeViewNodes(parentPath: string): TreeViewNode[] {
    const entries = nodeMapRef.current.get(parentPath) ?? [];
    return entries.map((entry) => {
      const hasLoadedChildren = entry.entryType === "directory" && nodeMapRef.current.has(entry.path);
      return {
        name: entry.name,
        path: entry.path,
        isDirectory: entry.entryType === "directory",
        children: entry.entryType === "directory" && remoteExpandedPaths.has(entry.path) && hasLoadedChildren
          ? buildTreeViewNodes(entry.path)
          : [],
      };
    });
  }

  const remoteTreeNodes: TreeViewNode[] = buildTreeViewNodes(remoteState?.currentPath ?? "");

  async function handleRemoteTreeToggle(path: string) {
    // 如果已经有 children 数据，直接切换展开状态
    if (nodeMapRef.current.has(path)) {
      setRemoteExpandedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
      return;
    }
    // 否则加载该目录的 children
    try {
      const entries = await loadRemoteChildren(path);
      nodeMapRef.current.set(path, entries);
      setRemoteExpandedPaths((prev) => {
        const next = new Set(prev);
        next.add(path);
        return next;
      });
    } catch (error) {
      setRemoteBrowseError(String(error));
    }
  }

  const renderRemoteRow = (node: TreeViewNode, _level: number, _isExpanded: boolean) => {
    const isDirectory = node.isDirectory ?? node.children.length > 0;
    // 在所有已加载的节点中查找当前节点的 entry 信息
    let entry: RemoteEntry | undefined;
    for (const entries of nodeMapRef.current.values()) {
      entry = entries.find((e) => e.path === node.path);
      if (entry) break;
    }
    return (
      <>
        <img className="tree-icon" src={isDirectory ? folderIconUrl : fileIconUrl} alt="" aria-hidden="true" />
        <strong>{node.name}</strong>
        <span>{isDirectory ? "文件夹" : entry?.size != null ? formatFileSize(entry.size) : "-"}</span>
        <time>-</time>
      </>
    );
  };

  return (
    <section className="panel file-browser-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Repository files</p>
          <h3>{t("browser.title")}</h3>
        </div>
        <div className="file-source-tabs">
          <Button variant={source === "local" ? "default" : "secondary"} size="sm" type="button" onClick={() => setSource("local")}>
            本地
          </Button>
          <Button variant={source === "remote" ? "default" : "secondary"} size="sm" type="button" disabled={!remoteUrl}
            title={!remoteUrl ? "此仓库没有远程 URL" : isSvn ? "浏览 SVN 远程仓库" : "浏览 GitHub 远程仓库"}
            onClick={() => {
              setSource("remote");
              handleRemoteBrowse("");
            }}>
            {isSvn ? "SVN 远程" : "远程"}
          </Button>
        </div>
        <Button variant="ghost" disabled={!selectedRepository || isLoading} onClick={() => {
            if (source === "local") {
              onLoadRepositoryFiles(repositoryFiles?.path ?? "");
            } else {
              handleRemoteBrowse(remoteState?.currentPath ?? "");
            }
          }}>
          {t("browser.refresh")}
        </Button>
      </div>

      {source === "local" ? (
        <>
          <div className="file-toolbar">
            <Button variant="secondary" disabled={repositoryFiles?.parentPath === null || repositoryFiles?.parentPath === undefined || isLoading} onClick={() => onLoadRepositoryFiles(repositoryFiles?.parentPath ?? "")}>
              {t("browser.goUp")}
            </Button>
            <div className="breadcrumb" aria-label={t("browser.currentPath")}>
              <button type="button" onClick={() => onLoadRepositoryFiles("")} disabled={isLoading}>
                {t("browser.root")}
              </button>
              {breadcrumbs.map((breadcrumb) => (
                <button
                  type="button"
                  key={breadcrumb.path}
                  onClick={() => onLoadRepositoryFiles(breadcrumb.path)}
                  disabled={isLoading}
                >
                  {breadcrumb.name}
                </button>
              ))}
            </div>
          </div>
          {repositoryFiles ? (
            repositoryFiles.entries.length === 0 ? (
              <EmptyState compact title={t("browser.empty")} description={t("browser.emptyDesc")} />
            ) : (
              <div className="tree-list file-tree">
                <TreeView
                  nodes={fileTreeNodes}
                  expandedPaths={expandedFilePaths}
                  renderRow={renderFileRow}
                  onToggle={onFileTreeToggle}
                  onDoubleClick={(node) => onFileTreeOpen(node.path)}
                  onContextMenu={(node, event) => {
                    if (!selectedRepository) return;
                    onContextMenu(event, node.path, selectedRepository.vcsType === "svn" ? "svn" : "git");
                  }}
                  rowClassName="tree-row file-tree-row"
                />
              </div>
            )
          ) : (
            <EmptyState compact title={isFileBrowserLoading ? "加载中..." : selectedRepository ? t("browser.notLoaded") : t("review.notSelected")} description={isFileBrowserLoading ? "正在读取文件列表" : selectedRepository ? t("browser.notLoadedDesc") : t("review.notDetected")} />
          )}
        </>
      ) : (
        <>
          <div className="file-toolbar">
            <Button variant="secondary" disabled={!remoteState || remoteState.parentPath === null || isLoading} onClick={() => handleRemoteBrowse(remoteState?.parentPath ?? "")}>
              {t("browser.goUp")}
            </Button>
            <div className="breadcrumb" aria-label={t("browser.currentPath")}>
              <button type="button" onClick={() => handleRemoteBrowse("")} disabled={isLoading}>
                {t("browser.root")}
              </button>
              {(remoteState?.breadcrumbs ?? []).slice(1).map((crumb) => (
                <button
                  type="button"
                  key={crumb.path}
                  onClick={() => handleRemoteBrowse(crumb.path)}
                  disabled={isLoading}
                >
                  {crumb.name}
                </button>
              ))}
            </div>
          </div>
          {!remoteState ? (
            remoteBrowseError ? (
              <div className="file-preview-error">
                <p>加载远程目录失败：</p>
                <pre>{remoteBrowseError}</pre>
              </div>
            ) : (
              <EmptyState compact title={t("browser.notLoaded")} description={!remoteUrl ? "无远程 URL" : "正在加载远程文件列表..."} />
            )
          ) : remoteTreeNodes.length === 0 ? (
            <EmptyState compact title={t("browser.empty")} description={t("browser.emptyDesc")} />
          ) : (
            <div className="tree-list file-tree">
              <TreeView
                nodes={remoteTreeNodes}
                expandedPaths={remoteExpandedPaths}
                renderRow={renderRemoteRow}
                onToggle={handleRemoteTreeToggle}
                onSelect={(node) => handleRemoteFileOpen({ name: node.name, path: node.path, entryType: "file", size: null })}
                onDoubleClick={(node) => handleRemoteFileOpen({ name: node.name, path: node.path, entryType: "file", size: null })}
                rowClassName="tree-row file-tree-row"
              />
            </div>
          )}
        </>
      )}

      {/* Local file preview */}
      <Modal
        open={isFilePreviewOpen}
        onClose={onCloseFilePreview}
        labelledBy="file-preview-title"
        className="file-preview-dialog"
      >
        <ModalHeading
          eyebrow="File preview"
          title={selectedFilePreview?.name ?? "文件预览"}
          titleId="file-preview-title"
          onClose={onCloseFilePreview}
          t={t}
        />
        {isFilePreviewLoading ? (
          <EmptyState compact title={t("preview.loading")} description="" />
        ) : selectedFilePreview ? (
          <>
            <aside className="file-preview-pane">
              <div className="file-preview-heading">
                <div>
                  <strong title={selectedFilePreview.path}>{selectedFilePreview.name}</strong>
                  <span title={selectedFilePreview.path}>{selectedFilePreview.path}</span>
                </div>
                <small>
                  {formatFileSize(selectedFilePreview.size)}
                  {" · "}
                  {formatModifiedAt(selectedFilePreview.modifiedAt)}
                </small>
              </div>
              {selectedFilePreview.warning ? (
                <p className="file-preview-warning">{selectedFilePreview.warning}</p>
              ) : null}
              {selectedFilePreview.isBinary ? (
                <EmptyState compact title={t("preview.binary")} description={t("preview.binaryDesc")} />
              ) : (
                <CodeBlock content={selectedFilePreview.content || t("preview.empty")} path={selectedFilePreview.path} />
              )}
            </aside>
          </>
        ) : (
          <EmptyState compact title={t("preview.failed")} description={t("preview.failedDesc")} />
        )}
      </Modal>

      {/* Remote file preview */}
      <Modal
        open={isRemotePreviewOpen}
        onClose={() => setIsRemotePreviewOpen(false)}
        labelledBy="remote-file-preview-title"
        className="file-preview-dialog"
      >
        <ModalHeading
          eyebrow="Remote file preview"
          title={remotePreview?.name ?? "远程文件预览"}
          titleId="remote-file-preview-title"
          onClose={() => {
            setIsRemotePreviewOpen(false);
            setRemotePreviewError(null);
          }}
          t={t}
        />
        {isRemotePreviewLoading ? (
          <EmptyState compact title={t("preview.loading")} description="" />
        ) : remotePreviewError ? (
          <div className="file-preview-error">
            <p>打开远程文件失败：</p>
            <pre>{remotePreviewError}</pre>
          </div>
        ) : remotePreview ? (
          <>
            <aside className="file-preview-pane">
              <div className="file-preview-heading">
                <div>
                  <strong title={remotePreview.path}>{remotePreview.name}</strong>
                  <span title={remotePreview.path}>{remotePreview.path}</span>
                </div>
                <small>{formatFileSize(remotePreview.size)}</small>
              </div>
              {remotePreview.isBinary ? (
                <EmptyState compact title={t("preview.binary")} description={t("preview.binaryDesc")} />
              ) : (
                <CodeBlock content={remotePreview.content || t("preview.empty")} path={remotePreview.path} />
              )}
            </aside>
          </>
        ) : (
          <EmptyState compact title={t("preview.failed")} description={t("preview.failedDesc")} />
        )}
      </Modal>
    </section>
  );
}
