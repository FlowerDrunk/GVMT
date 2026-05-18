import type { ChangeItem, ChangeStatus, RepositoryFileEntry, VcsType } from "./api";
import type { TreeViewNode } from "../components/shared/TreeView";
import type { Translator } from "./i18n";

export function getEmptyStateCopy(t: Translator) {
  return {
    title: t("repo.emptyTitle"),
    body: t("repo.emptyBody"),
  };
}

export function getVcsDescriptions(t: Translator): Record<VcsType, string> {
  return {
    git: t("repo.gitDetected"),
    svn: t("repo.svnDetected"),
    mixed: t("repo.mixedDetected"),
    unknown: t("repo.unknownDetected"),
  };
}

export function formatFileSize(size: number | null) {
  if (size === null) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function formatModifiedAt(value: number | null) {
  if (value === null) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value * 1000));
}

export function fileBreadcrumbs(path: string) {
  if (!path) return [];
  const parts = path.split("/");
  return parts.map((part, index) => ({
    name: part,
    path: parts.slice(0, index + 1).join("/"),
  }));
}

export function statusTone(vcsType: VcsType) {
  if (vcsType === "unknown") return "warning";
  if (vcsType === "mixed") return "mixed";
  return "ready";
}

export function formatRemoteUrlForDisplay(remoteUrl: string | null, notDetectedLabel?: string) {
  if (!remoteUrl) return notDetectedLabel ?? "未检测到";

  try {
    return decodeURI(remoteUrl);
  } catch {
    return remoteUrl;
  }
}

export interface ChangeTreeNode {
  name: string;
  path: string;
  children: ChangeTreeNode[];
  change?: {
    status: ChangeStatus;
    vcsType: VcsType;
    staged: boolean;
  };
}

export function buildChangeTree(changes: ChangeItem[]) {
  const root: ChangeTreeNode[] = [];
  const rootsByName = new Map<string, ChangeTreeNode>();

  for (const change of changes) {
    const parts = change.path.replace(/\\/g, "/").split("/").filter(Boolean);
    let children = root;
    let siblings = rootsByName;
    let currentPath = "";

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let node = siblings.get(part);
      if (!node) {
        node = {
          name: part,
          path: currentPath,
          children: [],
        };
        siblings.set(part, node);
        children.push(node);
      }

      if (index === parts.length - 1) {
        node.change = {
          status: change.status,
          vcsType: change.vcsType,
          staged: change.staged,
        };
      }

      children = node.children;
      siblings = new Map(node.children.map((child) => [child.name, child]));
    });
  }

  sortChangeTree(root);
  return root;
}

export function sortChangeTree(nodes: ChangeTreeNode[]) {
  nodes.sort((left, right) => {
    const leftDirectory = left.children.length > 0 && !left.change;
    const rightDirectory = right.children.length > 0 && !right.change;
    if (leftDirectory !== rightDirectory) return leftDirectory ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
  nodes.forEach((node) => sortChangeTree(node.children));
}

export function collectFileDirectoryPaths(entries: RepositoryFileEntry[]) {
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.entryType === "directory") {
      paths.push(entry.path);
      paths.push(...collectFileDirectoryPaths(entry.children));
    }
  }
  return paths;
}

export function collectChangeDirectoryPaths(nodes: ChangeTreeNode[]) {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.children.length > 0) {
      paths.push(node.path);
      paths.push(...collectChangeDirectoryPaths(node.children));
    }
  }
  return paths;
}

export function replaceFileTreeChildren(
  entries: RepositoryFileEntry[],
  targetPath: string,
  children: RepositoryFileEntry[],
): RepositoryFileEntry[] {
  return entries.map((entry) => {
    if (entry.path === targetPath) {
      return { ...entry, children };
    }

    if (entry.children.length > 0) {
      return { ...entry, children: replaceFileTreeChildren(entry.children, targetPath, children) };
    }

    return entry;
  });
}

export function diffLineClassName(line: string) {
  if (line.startsWith("+++") || line.startsWith("---")) return "meta";
  if (line.startsWith("+")) return "added";
  if (line.startsWith("-")) return "deleted";
  if (line.startsWith("@@")) return "hunk";
  return "context";
}

export function toFileTreeNodes(entries: RepositoryFileEntry[]): TreeViewNode[] {
  return entries.map((entry) => ({
    name: entry.name,
    path: entry.path,
    children: toFileTreeNodes(entry.children),
    isDirectory: entry.entryType === "directory",
  }));
}

export function buildFileEntryMap(entries: RepositoryFileEntry[]): Map<string, RepositoryFileEntry> {
  const map = new Map<string, RepositoryFileEntry>();
  for (const entry of entries) {
    map.set(entry.path, entry);
    for (const [key, value] of buildFileEntryMap(entry.children)) {
      map.set(key, value);
    }
  }
  return map;
}

export function changeTreeToViewNodes(nodes: ChangeTreeNode[]): TreeViewNode[] {
  return nodes.map((node) => {
    const hasChildren = node.children.length > 0;
    const isFile = !!node.change;
    return {
      name: node.name,
      path: node.path,
      children: changeTreeToViewNodes(node.children),
      isDirectory: hasChildren && !isFile,
    };
  });
}

export function buildChangeNodeMap(nodes: ChangeTreeNode[]): Map<string, ChangeTreeNode> {
  const map = new Map<string, ChangeTreeNode>();
  for (const node of nodes) {
    map.set(node.path, node);
    for (const [key, value] of buildChangeNodeMap(node.children)) {
      map.set(key, value);
    }
  }
  return map;
}
