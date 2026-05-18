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
import type { Translator } from "../lib/i18n";

interface UseRepositoriesOptions {
  setStatus: (value: string) => void;
  setIsLoading: (value: boolean) => void;
  t: Translator;
}

export function useRepositories({ setStatus, setIsLoading, t }: UseRepositoriesOptions) {
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
      setStatus(t("status.reposLoaded", { count: nextRepositories.length }));
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
      setStatus(t("status.enterRepoPath"));
      return;
    }

    setIsLoading(true);
    try {
      const repository = await addRepository({ path: trimmedPath });
      await refreshRepositories();
      setSelectedId(repository.id);
      setPath("");
      setStatus(t("status.repoAdded", { name: repository.name }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDetect() {
    if (!path.trim()) {
      setStatus(t("status.enterDetectPath"));
      return;
    }

    setIsLoading(true);
    try {
      const detected = await detectRepository(path.trim());
      setStatus(t("status.detectResult", { name: detected.name, type: detected.vcsType }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRefreshSelected() {
    if (!selectedRepository) {
      setStatus(t("status.selectRepoFirst"));
      return;
    }

    setIsLoading(true);
    try {
      const refreshed = await refreshRepository(selectedRepository.id);
      await refreshRepositories();
      setSelectedId(refreshed.id);
      setStatus(t("status.repoReDetected", { name: refreshed.name, type: refreshed.vcsType }));
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

    const wasSelected = selectedId === repositoryPendingDelete.id;
    setIsLoading(true);
    try {
      await deleteRepository(repositoryPendingDelete.id);
      setRepositoryPendingDelete(null);
      // Reload list but skip auto-select — don't trigger status scan on another large repo
      const nextRepositories = await listRepositories();
      setRepositories(nextRepositories);
      if (wasSelected) {
        setSelectedId(null);
      }
      setStatus(t("status.repoRecordDeleted"));
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
