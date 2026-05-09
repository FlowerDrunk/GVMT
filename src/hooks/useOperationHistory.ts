import { useCallback, useEffect, useState } from "react";
import type { OperationResult } from "../lib/api";
import { logOperation, listOperationLogs, clearOperationLogs, type OperationLog } from "../lib/api";

export interface HistoryEntry {
  id: number;
  results: OperationResult[];
  timestamp: number;
}

export function useOperationHistory(repositoryId?: number | null) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [nextId, setNextId] = useState(13);
  const [persistedLogs, setPersistedLogs] = useState<OperationLog[]>([]);

  // Load persisted logs on mount (or when repositoryId changes)
  useEffect(() => {
    if (!repositoryId) return;
    let cancelled = false;

    listOperationLogs(repositoryId, 50, 0)
      .then((logs) => {
        if (!cancelled) {
          setPersistedLogs(logs);
        }
      })
      .catch(() => {
        // silently fail
      });

    return () => {
      cancelled = true;
    };
  }, [repositoryId]);

  const addEntry = useCallback(
    (results: OperationResult[]) => {
      if (results.length === 0) return;

      const newId = nextId;
      // Add to in-memory history
      setHistory((current) => [
        { id: newId, results, timestamp: Date.now() },
        ...current.slice(0, 49),
      ]);
      setNextId((n) => n + 1);

      // Persist each result to backend
      for (const result of results) {
        logOperation({
          repositoryId: repositoryId ?? null,
          operation: result.operation,
          vcsType: result.vcsType,
          success: result.success,
          summary: result.summary,
          output: result.output,
          warning: result.warning,
        }).catch(() => {
          // silently fail — operation log is non-critical
        });
      }
    },
    [nextId, repositoryId],
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
    setPersistedLogs([]);
    clearOperationLogs().catch(() => {});
  }, []);

  const reloadPersistedLogs = useCallback(() => {
    if (!repositoryId) return;
    listOperationLogs(repositoryId, 50, 0)
      .then((logs) => setPersistedLogs(logs))
      .catch(() => {});
  }, [repositoryId]);

  return { history, persistedLogs, addEntry, clearHistory, reloadPersistedLogs };
}
