import { useCallback, useState } from "react";

export interface AppSettings {
  autoRefresh: boolean;
  refreshIntervalMs: number;
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
      };
    }
  } catch {
    // ignore corrupt data
  }
  return { autoRefresh: true, refreshIntervalMs: 12000 };
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
