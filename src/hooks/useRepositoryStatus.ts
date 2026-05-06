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

interface UseRepositoryStatusOptions {
  selectedRepository: Repository | undefined;
  autoRefresh: boolean;
  refreshIntervalMs: number;
  setStatus: (value: string) => void;
  setIsLoading: (value: boolean) => void;
}

export function useRepositoryStatus({
  selectedRepository,
  autoRefresh,
  refreshIntervalMs,
  setStatus,
  setIsLoading,
}: UseRepositoryStatusOptions) {
  const syncKeysRef = useRef<(changes: ChangeItem[]) => void>(() => {});
  const [repositoryStatus, setRepositoryStatus] = useState<RepositoryStatus | null>(null);
  const [operationResults, setOperationResults] = useState<OperationResult[]>([]);

  const loadRepositoryStatus = useCallback(
    async (silent = false) => {
      if (!selectedRepository) {
        if (!silent) setStatus("请先选择一个仓库");
        return;
      }

      if (!silent) setIsLoading(true);
      try {
        const nextStatus = await getRepositoryStatus(selectedRepository.id);
        setRepositoryStatus(nextStatus);
        syncKeysRef.current(nextStatus.changes);
        if (!silent) setStatus(nextStatus.clean ? "工作区干净" : `检测到 ${nextStatus.summary.total} 个变更`);
      } catch (error) {
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
      setStatus("请先选择一个仓库");
      return;
    }

    await loadRepositoryStatus(false);
  }

  async function handleOpenSvnDownload(target: "tortoise" | "sliksvn") {
    try {
      await openSvnCliDownloadPage(target);
      setStatus(target === "sliksvn" ? "已打开 SlikSVN 下载页" : "已打开 TortoiseSVN 下载页");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleUpdateRepository() {
    if (!selectedRepository) {
      setStatus("请先选择一个仓库");
      return;
    }

    setIsLoading(true);
    try {
      const results = await updateRepository(selectedRepository.id);
      setOperationResults(results);
      const failed = results.filter((result) => !result.success);
      setStatus(failed.length === 0 ? "更新完成" : `${failed.length} 个更新步骤失败`);
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

    let isCancelled = false;

    void loadRepositoryStatus(true);

    if (!autoRefresh) {
      return () => {
        isCancelled = true;
      };
    }

    const refreshTimer = window.setInterval(() => {
      void loadRepositoryStatus(true);
    }, refreshIntervalMs);

    return () => {
      isCancelled = true;
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
