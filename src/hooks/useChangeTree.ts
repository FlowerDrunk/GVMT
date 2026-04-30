import { useState } from "react";
import {
  getRepositoryDiff,
  type ChangeItem,
  type Repository,
  type RepositoryDiff,
} from "../lib/api";
import type { ChangeTreeNode } from "../lib/utils";

interface UseChangeTreeOptions {
  selectedRepository: Repository | undefined;
  setStatus: (value: string) => void;
}

export function useChangeTree({ selectedRepository, setStatus }: UseChangeTreeOptions) {
  const [selectedChange, setSelectedChange] = useState<ChangeItem | null>(null);
  const [diffPreview, setDiffPreview] = useState<RepositoryDiff | null>(null);
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  const [expandedChangePaths, setExpandedChangePaths] = useState<Set<string>>(new Set());

  async function handleSelectChange(path: string, change: ChangeTreeNode["change"]) {
    if (!selectedRepository || !change) return;

    const nextChange: ChangeItem = {
      path,
      status: change.status,
      vcsType: change.vcsType,
    };
    setSelectedChange(nextChange);
    setIsDiffLoading(true);
    try {
      const nextDiff = await getRepositoryDiff(selectedRepository.id, nextChange);
      setDiffPreview(nextDiff);
      setStatus(`已加载 diff：${path}`);
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
    setExpandedChangePaths(new Set());
  }

  return {
    selectedChange,
    diffPreview,
    isDiffLoading,
    expandedChangePaths,
    handleSelectChange,
    toggleChangeNode,
    setExpandedChangePaths,
    reset,
  };
}
