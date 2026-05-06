import { useCallback, useState } from "react";
import { isAppLanguage, type AppLanguage } from "../lib/i18n";

export type ViewModeSetting = "flat" | "tree";

export interface AppSettings {
  autoRefresh: boolean;
  refreshIntervalMs: number;
  defaultViewMode: ViewModeSetting;
  language: AppLanguage;
}

const SETTINGS_KEY = "gvmt-settings";

function readStoredSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        autoRefresh: parsed.autoRefresh ?? true,
        refreshIntervalMs: parsed.refreshIntervalMs ?? 12000,
        defaultViewMode: parsed.defaultViewMode === "tree" ? "tree" : "flat",
        language: isAppLanguage(parsed.language) ? parsed.language : "zh-CN",
      };
    }
  } catch {
    // ignore corrupt data
  }
  return { autoRefresh: true, refreshIntervalMs: 12000, defaultViewMode: "flat", language: "zh-CN" };
}

function writeSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(readStoredSettings);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettingsState((current) => {
      const next = { ...current, ...patch };
      writeSettings(next);
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
