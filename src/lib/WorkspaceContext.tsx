import { createContext, useContext, useMemo } from "react";
import { useToast, type Toast } from "../hooks/useToast";
import { useSettings, type AppSettings } from "../hooks/useSettings";
import { applyDocumentLanguage, createTranslator, type AppLanguage, type Translator } from "./i18n";

/* ------------------------------------------------------------------ */
/*  Context value                                                      */
/* ------------------------------------------------------------------ */

export interface WorkspaceContextValue {
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  status: string;
  setStatus: (v: string) => void;
  t: Translator;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  showToast: (message: string, kind?: "info" | "success" | "error") => void;
  toasts: Toast[];
  removeToast: (id: number) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

interface WorkspaceProviderProps {
  children: React.ReactNode;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  status: string;
  setStatus: (v: string) => void;
}

export function WorkspaceProvider({
  children,
  isLoading,
  setIsLoading,
  status,
  setStatus,
}: WorkspaceProviderProps) {
  const { settings, updateSettings } = useSettings();
  const { toasts, showToast, removeToast } = useToast();
  const t = useMemo(() => {
    applyDocumentLanguage(settings.language);
    return createTranslator(settings.language);
  }, [settings.language]);

  const value: WorkspaceContextValue = {
    isLoading,
    setIsLoading,
    status,
    setStatus,
    t,
    settings,
    updateSettings,
    showToast,
    toasts,
    removeToast,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
