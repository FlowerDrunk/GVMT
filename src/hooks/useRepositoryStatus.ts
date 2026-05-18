import { useCallback, useEffect, useRef, useState } from "react";
import {
  getRepositoryStatus,
  isTauriRuntime,
  openSvnCliDownloadPage,
  updateRepository,
  type ChangeItem,
  type OperationResult,
  type Repository,
  type RepositoryStatus,
} from "../lib/api";
import type { Translator } from "../lib/i18n";

interface UseRepositoryStatusOptions {
  selectedRepository: Repository | undefined;
  autoRefresh: boolean;
  refreshIntervalMs: number;
  setStatus: (value: string) => void;
  setIsLoading: (value: boolean) => void;
  t: Translator;
}

export function useRepositoryStatus({
  selectedRepository,
  autoRefresh,
  refreshIntervalMs,
  setStatus,
  setIsLoading,
  t,
}: UseRepositoryStatusOptions) {
  const abortRef = useRef(false);
  const syncKeysRef = useRef<(changes: ChangeItem[]) => void>(() => {});
  const [repositoryStatus, setRepositoryStatus] = useState<RepositoryStatus | null>(null);
  const [operationResults, setOperationResults] = useState<OperationResult[]>([]);

  const loadRepositoryStatus = useCallback(
    async (silent = false) => {
      if (!selectedRepository) {
        if (!silent) setStatus(t("status.selectRepoFirst"));
        return;
      }

      if (!silent) setIsLoading(true);
      try {
        const nextStatus = await getRepositoryStatus(selectedRepository.id);
        if (abortRef.current) return;
        setRepositoryStatus(nextStatus);
        syncKeysRef.current(nextStatus.changes);
        if (!silent) setStatus(nextStatus.clean ? t("status.clean") : t("status.changesDetected", { count: nextStatus.summary.total }));
      } catch (error) {
        if (abortRef.current) return;
        setRepositoryStatus(null);
        if (!silent) setStatus(error instanceof Error ? error.message : String(error));
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [selectedRepository, setStatus, setIsLoading],
  );

  async function handleLoadRepositoryStatus() {
    if (!selectedRepository) {
      setStatus(t("status.selectRepoFirst"));
      return;
    }

    await loadRepositoryStatus(false);
  }

  async function handleOpenSvnDownload(target: "tortoise" | "sliksvn") {
    try {
      await openSvnCliDownloadPage(target);
      setStatus(target === "sliksvn" ? t("status.openedSlikSvn") : t("status.openedTortoise"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleUpdateRepository(depth?: string) {
    if (!selectedRepository) {
      setStatus(t("status.selectRepoFirst"));
      return;
    }

    setIsLoading(true);
    try {
      const results = await updateRepository(selectedRepository.id, depth);
      setOperationResults(results);
      const failed = results.filter((result) => !result.success);
      setStatus(failed.length === 0 ? t("status.updateComplete") : t("status.updateStepsFailed", { count: failed.length }));
      await handleLoadRepositoryStatus();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedRepository || !isTauriRuntime()) {
      return;
    }

    abortRef.current = false;
    let isCancelled = false;

    void loadRepositoryStatus(true).then(() => {
      if (isCancelled) return;
    });

    if (!autoRefresh) {
      return () => {
        isCancelled = true;
        abortRef.current = true;
      };
    }

    const refreshTimer = window.setInterval(() => {
      void loadRepositoryStatus(true);
    }, refreshIntervalMs);

    return () => {
      isCancelled = true;
      abortRef.current = true;
      window.clearInterval(refreshTimer);
    };
  }, [selectedRepository?.id, loadRepositoryStatus, autoRefresh, refreshIntervalMs]);

  function reset() {
    setRepositoryStatus(null);
    setOperationResults([]);
  }

  return {
    repositoryStatus,
    setRepositoryStatus,
    operationResults,
    setOperationResults,
    syncKeysRef,
    loadRepositoryStatus,
    handleLoadRepositoryStatus,
    handleOpenSvnDownload,
    handleUpdateRepository,
    reset,
  };
}
