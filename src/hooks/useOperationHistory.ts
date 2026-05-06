import { useCallback, useState } from "react";
import type { OperationResult } from "../lib/api";

export interface HistoryEntry {
  id: number;
  results: OperationResult[];
  timestamp: number;
}

export function useOperationHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [nextId, setNextId] = useState(1);

  const addEntry = useCallback(
    (results: OperationResult[]) => {
      if (results.length === 0) return;

      setHistory((current) => [
        { id: nextId, results, timestamp: Date.now() },
        ...current.slice(0, 49), // keep last 50
      ]);
      setNextId((n) => n + 1);
    },
    [nextId],
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return { history, addEntry, clearHistory };
}
