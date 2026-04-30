import { FormEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import {
  addRepository,
  deleteRepository,
  detectRepository,
  listRepositories,
  refreshRepository,
  type Repository,
} from "../lib/api";
import { useContextMenu } from "./useContextMenu";

interface UseRepositoriesOptions {
  setStatus: (value: string) => void;
  setIsLoading: (value: boolean) => void;
}

export function useRepositories({ setStatus, setIsLoading }: UseRepositoriesOptions) {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [path, setPath] = useState("");
  const [repositoryPendingDelete, setRepositoryPendingDelete] = useState<Repository | null>(null);
  const repoContextMenu = useContextMenu<Repository>();

  const selectedRepository = useMemo(
    () => repositories.find((repository) => repository.id === selectedId) ?? repositories[0],
    [repositories, selectedId],
  );

  const repositoryStats = useMemo(
    () => ({
      total: repositories.length,
      git: repositories.filter((repository) => repository.vcsType === "git").length,
      svn: repositories.filter((repository) => repository.vcsType === "svn").length,
      unknown: repositories.filter((repository) => repository.vcsType === "unknown").length,
    }),
    [repositories],
  );

  async function refreshRepositories() {
    setIsLoading(true);
    try {
      const nextRepositories = await listRepositories();
      setRepositories(nextRepositories);
      if (nextRepositories.length === 0) {
        setSelectedId(null);
      } else if (!selectedId || !nextRepositories.some((repository) => repository.id === selectedId)) {
        setSelectedId(nextRepositories[0].id);
      }
      setStatus(`已加载 ${nextRepositories.length} 个仓库`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refreshRepositories();
  }, []);

  async function handleAddRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPath = path.trim();
    if (!trimmedPath) {
      setStatus("请输入本地仓库路径");
      return;
    }

    setIsLoading(true);
    try {
      const repository = await addRepository({ path: trimmedPath });
      await refreshRepositories();
      setSelectedId(repository.id);
      setPath("");
      setStatus(`已添加 ${repository.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDetect() {
    if (!path.trim()) {
      setStatus("请输入需要检测的路径");
      return;
    }

    setIsLoading(true);
    try {
      const detected = await detectRepository(path.trim());
      setStatus(`检测结果：${detected.name} / ${detected.vcsType}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRefreshSelected() {
    if (!selectedRepository) {
      setStatus("请先选择一个仓库");
      return;
    }

    setIsLoading(true);
    try {
      const refreshed = await refreshRepository(selectedRepository.id);
      await refreshRepositories();
      setSelectedId(refreshed.id);
      setStatus(`已重新检测 ${refreshed.name}：${refreshed.vcsType}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  function handleRepositoryContextMenu(event: MouseEvent<HTMLButtonElement>, repository: Repository) {
    event.preventDefault();
    setSelectedId(repository.id);
    repoContextMenu.open(repository, event.clientX, event.clientY);
  }

  async function handleDeleteRepositoryRecord() {
    if (!repositoryPendingDelete) return;

    setIsLoading(true);
    try {
      await deleteRepository(repositoryPendingDelete.id);
      if (selectedId === repositoryPendingDelete.id) {
        setSelectedId(null);
      }
      setRepositoryPendingDelete(null);
      await refreshRepositories();
      setStatus("已删除仓库记录，本地文件未受影响");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  return {
    repositories,
    selectedId,
    setSelectedId,
    path,
    setPath,
    selectedRepository,
    repositoryStats,
    repositoryPendingDelete,
    setRepositoryPendingDelete,
    refreshRepositories,
    handleAddRepository,
    handleDetect,
    handleRefreshSelected,
    handleRepositoryContextMenu,
    handleDeleteRepositoryRecord,
    repoContextMenu,
  };
}
