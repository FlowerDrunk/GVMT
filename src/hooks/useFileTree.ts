import { useState } from "react";
import {
  listRepositoryFiles,
  type Repository,
  type RepositoryDirectory,
  type RepositoryFileEntry,
} from "../lib/api";
import { replaceFileTreeChildren } from "../lib/utils";

interface UseFileTreeOptions {
  selectedRepository: Repository | undefined;
  setStatus: (value: string) => void;
}

export function useFileTree({ selectedRepository, setStatus }: UseFileTreeOptions) {
  const [repositoryFiles, setRepositoryFiles] = useState<RepositoryDirectory | null>(null);
  const [expandedFilePaths, setExpandedFilePaths] = useState<Set<string>>(new Set());
  const [loadedFilePaths, setLoadedFilePaths] = useState<Set<string>>(new Set());
  const [isFileBrowserLoading, setIsFileBrowserLoading] = useState(false);

  async function handleLoadRepositoryFiles(relativePath = "") {
    if (!selectedRepository) {
      setStatus("请先选择一个仓库");
      return;
    }

    setIsFileBrowserLoading(true);
    try {
      const nextFiles = await listRepositoryFiles(selectedRepository.id, relativePath);
      setRepositoryFiles(nextFiles);
      setExpandedFilePaths(new Set());
      setLoadedFilePaths(new Set([nextFiles.path]));
      setStatus(nextFiles.path ? `已打开 ${nextFiles.path}` : "已打开仓库根目录");
    } catch (error) {
      setRepositoryFiles(null);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsFileBrowserLoading(false);
    }
  }

  function toggleFileNode(path: string) {
    setExpandedFilePaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  async function handleExpandFileEntry(entry: RepositoryFileEntry) {
    if (!selectedRepository || entry.entryType !== "directory") return;

    if (expandedFilePaths.has(entry.path)) {
      toggleFileNode(entry.path);
      return;
    }

    if (!loadedFilePaths.has(entry.path)) {
      setIsFileBrowserLoading(true);
      try {
        const nextDirectory = await listRepositoryFiles(selectedRepository.id, entry.path);
        setRepositoryFiles((current) =>
          current
            ? {
                ...current,
                entries: replaceFileTreeChildren(current.entries, entry.path, nextDirectory.entries),
              }
            : current,
        );
        setLoadedFilePaths((current) => new Set(current).add(entry.path));
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
        return;
      } finally {
        setIsFileBrowserLoading(false);
      }
    }

    setExpandedFilePaths((current) => new Set(current).add(entry.path));
  }

  function reset() {
    setRepositoryFiles(null);
    setExpandedFilePaths(new Set());
    setLoadedFilePaths(new Set());
  }

  return {
    repositoryFiles,
    expandedFilePaths,
    loadedFilePaths,
    isFileBrowserLoading,
    handleLoadRepositoryFiles,
    handleExpandFileEntry,
    setExpandedFilePaths,
    setLoadedFilePaths,
    reset,
  };
}
