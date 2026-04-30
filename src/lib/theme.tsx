import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "gvmt-theme";

function readStoredTheme(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

function applyThemeAttributes(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.setAttribute("data-theme-resolved", resolveTheme(mode));
}

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredTheme);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(mode));

  const setMode = useCallback((nextMode: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, nextMode);
    applyThemeAttributes(nextMode);
    setModeState(nextMode);
    setResolved(resolveTheme(nextMode));
  }, []);

  useEffect(() => {
    applyThemeAttributes(mode);

    if (mode !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    function handleChange() {
      const next = resolveTheme("system");
      document.documentElement.setAttribute("data-theme-resolved", next);
      setResolved(next);
    }
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, [mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, setMode }),
    [mode, resolved, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
