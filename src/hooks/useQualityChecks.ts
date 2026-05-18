import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listQualityChecks,
  runQualityCheck,
  type QualityCheckResult,
  type QualityCheckStatus,
  type QualityCheckTemplate,
  type QualityCheckType,
  type Repository,
} from "../lib/api";
import type { Translator } from "../lib/i18n";

const fallbackTemplates: QualityCheckTemplate[] = [
  {
    checkType: "typescriptBuild",
    label: "TypeScript build",
    command: "npm run build",
    available: true,
    unavailableReason: null,
  },
  {
    checkType: "playwrightUi",
    label: "Playwright UI tests",
    command: "npm run test:ui",
    available: true,
    unavailableReason: null,
  },
  {
    checkType: "cargoCheck",
    label: "Rust cargo check",
    command: "cargo check",
    available: true,
    unavailableReason: null,
  },
];

interface UseQualityChecksOptions {
  selectedRepository: Repository | undefined;
  setStatus: (status: string) => void;
  showToast: (message: string, tone?: "success" | "error" | "info") => void;
  t: Translator;
}

export function useQualityChecks({
  selectedRepository,
  setStatus,
  showToast,
  t,
}: UseQualityChecksOptions) {
  const [templates, setTemplates] = useState<QualityCheckTemplate[]>(fallbackTemplates);
  const [results, setResults] = useState<Partial<Record<QualityCheckType, QualityCheckResult>>>({});
  const [runningChecks, setRunningChecks] = useState<Set<QualityCheckType>>(new Set());
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);

  const loadQualityChecks = useCallback(async () => {
    if (!selectedRepository) {
      setTemplates(fallbackTemplates);
      return;
    }

    setIsLoadingTemplates(true);
    try {
      const nextTemplates = await listQualityChecks(selectedRepository.id);
      setTemplates(nextTemplates.length > 0 ? nextTemplates : fallbackTemplates);
    } catch (error) {
      setTemplates(fallbackTemplates);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [selectedRepository?.id, setStatus]);

  useEffect(() => {
    setResults({});
    setRunningChecks(new Set());
    void loadQualityChecks();
  }, [loadQualityChecks]);

  const checks = useMemo(
    () =>
      templates.map((template) => {
        const result = results[template.checkType];
        const status: QualityCheckStatus = runningChecks.has(template.checkType)
          ? "running"
          : result?.status ?? "idle";
        return { ...template, result, status };
      }),
    [templates, results, runningChecks],
  );

  const latestResult = useMemo(() => {
    return Object.values(results)
      .filter((result): result is QualityCheckResult => Boolean(result))
      .sort((left, right) => right.finishedAt - left.finishedAt)[0] ?? null;
  }, [results]);

  async function runCheck(checkType: QualityCheckType) {
    if (!selectedRepository) {
      setStatus(t("status.selectRepoFirst"));
      return;
    }

    const template = templates.find((item) => item.checkType === checkType);
    if (template && !template.available) {
      setStatus(template.unavailableReason ?? t("status.checkUnavailable"));
      return;
    }

    setRunningChecks((current) => new Set(current).add(checkType));
    setStatus(t("status.runningCheck", { label: template?.label ?? "quality check" }));
    try {
      const result = await runQualityCheck(selectedRepository.id, checkType);
      setResults((current) => ({ ...current, [checkType]: result }));
      setStatus(result.summary);
      showToast(result.summary, result.success ? "success" : "info");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message);
      showToast(message, "error");
    } finally {
      setRunningChecks((current) => {
        const next = new Set(current);
        next.delete(checkType);
        return next;
      });
      void loadQualityChecks();
    }
  }

  return {
    checks,
    latestResult,
    isLoadingTemplates,
    runCheck,
    loadQualityChecks,
  };
}
