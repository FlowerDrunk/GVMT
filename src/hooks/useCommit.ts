import { useMemo, useRef, useState } from "react";
import type { ChangeItem, Repository } from "../lib/api";
import { changeKey, isCommittableChange } from "../lib/constants";

interface UseCommitOptions {
  selectedRepository: Repository | undefined;
  changedFiles: ChangeItem[];
}

export function useCommit({ selectedRepository, changedFiles }: UseCommitOptions) {
  const commitMessageRef = useRef("");
  const [pushAfterCommit, setPushAfterCommit] = useState(true);
  const [selectedCommitKeys, setSelectedCommitKeys] = useState<Set<string>>(new Set());
  const [isCommitLoading, setIsCommitLoading] = useState(false);
  const [isCommitDialogOpen, setIsCommitDialogOpen] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitHash, setCommitHash] = useState<string | null>(null);

  const committableFiles = useMemo(
    () => changedFiles.filter(isCommittableChange),
    [changedFiles],
  );

  const selectedCommitCount = useMemo(
    () => committableFiles.filter((c) => selectedCommitKeys.has(changeKey(c))).length,
    [committableFiles, selectedCommitKeys],
  );

  const selectedVcsCounts = useMemo(() => {
    let git = 0;
    let svn = 0;
    for (const c of committableFiles) {
      if (!selectedCommitKeys.has(changeKey(c))) continue;
      if (c.vcsType === "svn") svn++;
      else git++;
    }
    return { git, svn, total: git + svn };
  }, [committableFiles, selectedCommitKeys]);

  const hasGitCommitSelection = useMemo(
    () =>
      committableFiles.some(
        (c) => c.vcsType === "git" && selectedCommitKeys.has(changeKey(c)),
      ),
    [committableFiles, selectedCommitKeys],
  );

  const canOpenCommitDialog = Boolean(
    selectedRepository && committableFiles.length > 0,
  );

  function toggleCommitFile(change: ChangeItem) {
    const key = changeKey(change);
    setSelectedCommitKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleAllCommitFiles(changes: ChangeItem[]) {
    const keys = changes.map(changeKey);
    setSelectedCommitKeys((current) => {
      const allSelected = keys.length > 0 && keys.every((key) => current.has(key));
      return allSelected ? new Set() : new Set(keys);
    });
  }

  function selectAllFiles(changes: ChangeItem[]) {
    setSelectedCommitKeys(new Set(changes.map(changeKey)));
  }

  function syncKeys(changes: ChangeItem[]) {
    const nextKeys = new Set(changes.map(changeKey));
    setSelectedCommitKeys((current) => {
      return new Set([...current].filter((key) => nextKeys.has(key)));
    });
  }

  function resetCommitState() {
    commitMessageRef.current = "";
    setSelectedCommitKeys(new Set());
    setIsCommitLoading(false);
    setIsCommitDialogOpen(false);
    setCommitError(null);
    setCommitHash(null);
  }

  return {
    commitMessageRef,
    pushAfterCommit,
    setPushAfterCommit,
    selectedCommitKeys,
    isCommitLoading,
    setIsCommitLoading,
    isCommitDialogOpen,
    setIsCommitDialogOpen,
    committableFiles,
    selectedCommitCount,
    selectedVcsCounts,
    hasGitCommitSelection,
    canOpenCommitDialog,
    commitError,
    setCommitError,
    commitHash,
    setCommitHash,
    toggleCommitFile,
    toggleAllCommitFiles,
    selectAllFiles,
    syncKeys,
    resetCommitState,
  };
}
