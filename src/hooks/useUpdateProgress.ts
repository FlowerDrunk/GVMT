import { useCallback, useRef, useState } from "react";

export interface UpdateProgressState {
  lines: string[];
  cloning: boolean;
  stats: { files: number; sizeMb?: number; speedKbps?: number } | null;
  progress: number | null;
  startedAt: number; // epoch seconds when the update started
}

export function useUpdateProgress() {
  const [progressMap, setProgressMap] = useState<Record<number, UpdateProgressState>>({});
  const listenersRef = useRef<Record<number, (() => void)[]>>({});

  const startUpdate = useCallback((repoId: number, cloning: boolean) => {
    setProgressMap((prev) => ({
      ...prev,
      [repoId]: { lines: [], cloning, stats: null, progress: null, startedAt: Date.now() / 1000 },
    }));
  }, []);

  const addLine = useCallback((repoId: number, line: string) => {
    setProgressMap((prev) => {
      const cur = prev[repoId];
      if (!cur) return prev;
      return { ...prev, [repoId]: { ...cur, lines: [...cur.lines, line] } };
    });
  }, []);

  const setStats = useCallback((repoId: number, stats: { files: number; sizeMb?: number; speedKbps?: number } | null) => {
    setProgressMap((prev) => {
      const cur = prev[repoId];
      if (!cur) return prev;
      return { ...prev, [repoId]: { ...cur, stats } };
    });
  }, []);

  const setProgress = useCallback((repoId: number, progress: number | null) => {
    setProgressMap((prev) => {
      const cur = prev[repoId];
      if (!cur) return prev;
      return { ...prev, [repoId]: { ...cur, progress } };
    });
  }, []);

  const finishUpdate = useCallback((repoId: number) => {
    const listeners = listenersRef.current[repoId];
    if (listeners) {
      for (const fn of listeners) fn();
      delete listenersRef.current[repoId];
    }
    setProgressMap((prev) => {
      const next = { ...prev };
      delete next[repoId];
      return next;
    });
  }, []);

  /** Register a cleanup callback that fires when the update for this repo finishes. */
  const registerCleanup = useCallback((repoId: number, fn: () => void) => {
    if (!listenersRef.current[repoId]) listenersRef.current[repoId] = [];
    listenersRef.current[repoId].push(fn);
  }, []);

  return {
    progressMap,
    startUpdate,
    addLine,
    setStats,
    setProgress,
    finishUpdate,
    registerCleanup,
  };
}
