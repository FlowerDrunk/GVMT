import { useState } from "react";
import {
  addIgnoreRule,
  getIgnoreRules,
  updateGitignore,
  updateSvnIgnore,
  type IgnoreRules,
  type OperationResult,
  type Repository,
  type VcsType,
} from "../lib/api";

interface UseIgnoreRulesOptions {
  selectedRepository: Repository | undefined;
  loadRepositoryStatus: (silent: boolean) => Promise<void>;
  setOperationResults: (results: OperationResult[]) => void;
  onCloseContextMenu: () => void;
  setStatus: (value: string) => void;
}

export function useIgnoreRules({
  selectedRepository,
  loadRepositoryStatus,
  setOperationResults,
  onCloseContextMenu,
  setStatus,
}: UseIgnoreRulesOptions) {
  const [ignoreRules, setIgnoreRules] = useState<IgnoreRules | null>(null);
  const [isIgnoreDialogOpen, setIsIgnoreDialogOpen] = useState(false);
  const [isIgnoreLoading, setIsIgnoreLoading] = useState(false);

  async function handleOpenIgnoreDialog() {
    if (!selectedRepository) {
      setStatus("请先选择一个仓库");
      return;
    }

    setIsIgnoreLoading(true);
    try {
      const rules = await getIgnoreRules(selectedRepository.id);
      setIgnoreRules(rules);
      setIsIgnoreDialogOpen(true);
      setStatus("已加载忽略规则");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsIgnoreLoading(false);
    }
  }

  async function handleAddIgnoreRule(path: string, vcsType: VcsType) {
    if (!selectedRepository) return;

    setIsIgnoreLoading(true);
    onCloseContextMenu();
    try {
      const result = await addIgnoreRule(selectedRepository.id, { path, vcsType });
      setOperationResults([result]);
      setStatus(result.success ? result.summary : `忽略操作失败：${result.warning ?? ""}`);
      if (result.success) {
        await loadRepositoryStatus(true);
        if (ignoreRules) {
          const updated = await getIgnoreRules(selectedRepository.id);
          setIgnoreRules(updated);
        }
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsIgnoreLoading(false);
    }
  }

  async function handleSaveGitignore() {
    if (!selectedRepository || !ignoreRules) return;

    setIsIgnoreLoading(true);
    try {
      const content = ignoreRules.gitignoreContent ?? "";
      const result = await updateGitignore(selectedRepository.id, { content });
      setOperationResults([result]);
      setStatus(result.summary);
      if (result.success) {
        await loadRepositoryStatus(true);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsIgnoreLoading(false);
    }
  }

  async function handleSaveSvnIgnore() {
    if (!selectedRepository || !ignoreRules) return;

    setIsIgnoreLoading(true);
    try {
      const content = ignoreRules.svnignoreContent ?? "";
      const result = await updateSvnIgnore(selectedRepository.id, content);
      setOperationResults([result]);
      setStatus(result.summary);
      if (result.success) {
        await loadRepositoryStatus(true);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsIgnoreLoading(false);
    }
  }

  function reset() {
    setIgnoreRules(null);
    setIsIgnoreDialogOpen(false);
  }

  return {
    ignoreRules,
    setIgnoreRules,
    isIgnoreDialogOpen,
    setIsIgnoreDialogOpen,
    isIgnoreLoading,
    handleOpenIgnoreDialog,
    handleAddIgnoreRule,
    handleSaveGitignore,
    handleSaveSvnIgnore,
    reset,
  };
}
