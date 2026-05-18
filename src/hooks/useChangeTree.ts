import { useState } from "react";
import {
  getRepositoryDiff,
  type ChangeItem,
  type Repository,
  type RepositoryDiff,
} from "../lib/api";
import type { ChangeTreeNode } from "../lib/utils";
import type { Translator } from "../lib/i18n";

interface UseChangeTreeOptions {
  selectedRepository: Repository | undefined;
  setStatus: (value: string) => void;
  t: Translator;
}

export function useChangeTree({ selectedRepository, setStatus, t }: UseChangeTreeOptions) {
  const [selectedChange, setSelectedChange] = useState<ChangeItem | null>(null);
  const [diffPreview, setDiffPreview] = useState<RepositoryDiff | null>(null);
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  const [isDiffDialogOpen, setIsDiffDialogOpen] = useState(false);
  const [expandedChangePaths, setExpandedChangePaths] = useState<Set<string>>(new Set());

  function selectChange(path: string, change: ChangeTreeNode["change"]) {
    if (!selectedRepository || !change) return;

    const nextChange: ChangeItem = {
      path,
      status: change.status,
      vcsType: change.vcsType,
      staged: change.staged,
    };
    setSelectedChange(nextChange);
  }

  async function handleOpenChangeDiff(path: string, change: ChangeTreeNode["change"]) {
    if (!selectedRepository || !change) return;

    const nextChange: ChangeItem = {
      path,
      status: change.status,
      vcsType: change.vcsType,
      staged: change.staged,
    };
    setSelectedChange(nextChange);
    setDiffPreview(null);
    setIsDiffDialogOpen(true);
    setIsDiffLoading(true);
    try {
      const nextDiff = await getRepositoryDiff(selectedRepository.id, nextChange);
      setDiffPreview(nextDiff);
      setStatus(t("status.diffLoaded", { path }));
    } catch (error) {
      setDiffPreview(null);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDiffLoading(false);
    }
  }

  function toggleChangeNode(path: string) {
    setExpandedChangePaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function reset() {
    setSelectedChange(null);
    setDiffPreview(null);
    setIsDiffLoading(false);
    setIsDiffDialogOpen(false);
    setExpandedChangePaths(new Set());
  }

  function closeDiffDialog() {
    setIsDiffDialogOpen(false);
  }

  return {
    selectedChange,
    diffPreview,
    isDiffLoading,
    isDiffDialogOpen,
    expandedChangePaths,
    selectChange,
    handleOpenChangeDiff,
    closeDiffDialog,
    toggleChangeNode,
    setExpandedChangePaths,
    reset,
  };
}
