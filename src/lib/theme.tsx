import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export type ThemeAlgorithm = "light" | "dark" | "system";
export type ThemeTokenValue = string | number;

export interface CustomThemeConfig {
  algorithm?: ThemeAlgorithm;
  token?: Record<string, ThemeTokenValue>;
}

interface ThemeValidationResult {
  config: CustomThemeConfig | null;
  error: string | null;
}

interface SetCustomThemeResult {
  ok: boolean;
  error?: string;
}

const STORAGE_KEY = "gvmt-theme";
const CUSTOM_THEME_STORAGE_KEY = "gvmt-custom-theme";

const THEME_STYLE_PROPS = [
  "--body-bg",
  "--body-gradient-start",
  "--body-gradient-end",
  "--surface",
  "--surface-strong",
  "--surface-muted",
  "--surface-soft",
  "--surface-glass",
  "--surface-glass-strong",
  "--rail",
  "--backdrop",
  "--line",
  "--line-strong",
  "--line-alpha",
  "--line-strong-alpha",
  "--tree-line",
  "--text",
  "--text-soft",
  "--muted",
  "--subtle",
  "--disabled",
  "--text-on-accent",
  "--accent",
  "--accent-hover",
  "--accent-active",
  "--accent-soft",
  "--accent-soft-hover",
  "--accent-border",
  "--accent-focus-border",
  "--accent-ring",
  "--hover-bg",
  "--hover-border",
  "--success",
  "--success-hover",
  "--success-active",
  "--success-soft",
  "--success-border",
  "--warning",
  "--warning-hover",
  "--warning-active",
  "--warning-soft",
  "--warning-border",
  "--mixed",
  "--mixed-soft",
  "--danger",
  "--danger-fg",
  "--danger-hover",
  "--danger-active",
  "--danger-soft",
  "--danger-border",
  "--danger-hover-bg",
  "--info",
  "--info-soft",
  "--diff-added-bg",
  "--diff-added-fg",
  "--diff-deleted-bg",
  "--diff-deleted-fg",
  "--diff-hunk-bg",
  "--diff-hunk-fg",
  "--diff-meta-fg",
  "--syntax-comment",
  "--syntax-keyword",
  "--syntax-string",
  "--syntax-number",
  "--syntax-property",
  "--syntax-tag",
  "--syntax-gutter",
  "--scrollbar-thumb",
  "--scrollbar-track",
  "--radius-xs",
  "--radius-sm",
  "--radius-md",
  "--radius-lg",
  "--radius-xl",
  "--radius-pill",
  "--space-xs",
  "--space-sm",
  "--space-md",
  "--space-lg",
  "--space-xl",
  "--control-height-sm",
  "--control-height-md",
  "--control-padding-x",
  "--button-height-sm",
  "--button-height-md",
  "--button-padding-x",
  "--button-radius",
  "--button-shadow",
  "--button-default-bg",
  "--button-default-color",
  "--button-default-border",
  "--button-default-hover-bg",
  "--button-default-hover-color",
  "--button-default-hover-border",
  "--button-default-active-bg",
  "--button-default-active-border",
  "--shadow",
  "--shadow-secondary",
  "--shadow-elevated",
] as const;

const TOKEN_TO_CSS_VAR: Record<string, string[]> = {
  colorPrimary: ["--accent"],
  colorPrimaryHover: ["--accent-hover"],
  colorPrimaryActive: ["--accent-active"],
  colorPrimaryText: ["--accent"],
  colorPrimaryTextHover: ["--accent-hover"],
  colorPrimaryTextActive: ["--accent-active"],
  colorPrimaryBg: ["--accent-soft", "--hover-bg"],
  colorPrimaryBgHover: ["--accent-soft-hover", "--hover-bg"],
  colorPrimaryBorder: ["--accent-border"],
  colorPrimaryBorderHover: ["--accent-focus-border", "--hover-border"],
  colorSuccess: ["--success"],
  colorSuccessText: ["--success"],
  colorSuccessTextHover: ["--success-hover"],
  colorSuccessTextActive: ["--success-active"],
  colorSuccessBg: ["--success-soft"],
  colorSuccessBgHover: ["--success-soft"],
  colorSuccessBorder: ["--success-border"],
  colorSuccessBorderHover: ["--success-hover"],
  colorWarning: ["--warning"],
  colorWarningText: ["--warning"],
  colorWarningTextHover: ["--warning-hover"],
  colorWarningTextActive: ["--warning-active"],
  colorWarningBg: ["--warning-soft"],
  colorWarningBgHover: ["--warning-soft"],
  colorWarningBorder: ["--warning-border"],
  colorWarningBorderHover: ["--warning-hover"],
  colorError: ["--danger", "--danger-fg"],
  colorErrorText: ["--danger-fg"],
  colorErrorTextHover: ["--danger-hover"],
  colorErrorTextActive: ["--danger-active"],
  colorErrorBg: ["--danger-soft"],
  colorErrorBgHover: ["--danger-hover-bg"],
  colorErrorBorder: ["--danger-border"],
  colorErrorBorderHover: ["--danger-hover"],
  colorInfo: ["--info", "--accent"],
  colorInfoText: ["--info", "--accent"],
  colorInfoTextHover: ["--accent-hover"],
  colorInfoTextActive: ["--accent-active"],
  colorInfoBg: ["--info-soft", "--accent-soft"],
  colorInfoBgHover: ["--accent-soft-hover"],
  colorInfoBorder: ["--accent-border"],
  colorInfoBorderHover: ["--accent-focus-border"],
  colorTextBase: ["--text"],
  colorText: ["--text"],
  colorTextSecondary: ["--muted"],
  colorTextTertiary: ["--subtle"],
  colorTextQuaternary: ["--subtle"],
  colorTextDisabled: ["--disabled"],
  colorBgBase: ["--body-bg", "--rail"],
  colorBgLayout: ["--body-bg", "--body-gradient-end", "--rail"],
  colorBgContainer: ["--surface", "--surface-muted", "--surface-glass"],
  colorBgElevated: ["--surface-strong", "--surface-glass-strong"],
  colorBgSpotlight: ["--backdrop"],
  colorBgMask: ["--backdrop"],
  colorBorder: ["--line-strong", "--tree-line"],
  colorBorderSecondary: ["--line", "--line-alpha", "--line-strong-alpha"],
  borderRadius: ["--radius-md", "--radius-lg", "--radius-xl"],
  borderRadiusXS: ["--radius-xs"],
  borderRadiusSM: ["--radius-sm"],
  borderRadiusLG: ["--radius-lg"],
  padding: ["--space-md", "--control-padding-x"],
  paddingSM: ["--space-sm"],
  paddingLG: ["--space-lg"],
  margin: ["--space-md"],
  marginSM: ["--space-sm"],
  marginLG: ["--space-lg"],
  boxShadow: ["--shadow", "--shadow-elevated"],
  boxShadowSecondary: ["--shadow-secondary"],
  buttonBg: ["--button-default-bg"],
  buttonColor: ["--button-default-color"],
  buttonBorderColor: ["--button-default-border"],
  buttonBorderRadius: ["--button-radius"],
  buttonPadding: ["--button-padding-x"],
  buttonShadow: ["--button-shadow"],
  buttonHoverBg: ["--button-default-hover-bg"],
  buttonHoverColor: ["--button-default-hover-color"],
  buttonHoverBorderColor: ["--button-default-hover-border"],
  buttonPrimaryBg: ["--accent"],
  buttonPrimaryColor: ["--text-on-accent"],
  buttonPrimaryBorderColor: ["--accent"],
  buttonPrimaryHoverBg: ["--accent-hover"],
  buttonPrimaryHoverColor: ["--text-on-accent"],
  buttonPrimaryHoverBorderColor: ["--accent-hover"],
  buttonSecondaryBg: ["--button-default-bg"],
  buttonSecondaryColor: ["--button-default-color"],
  buttonSecondaryBorderColor: ["--button-default-border"],
  buttonSecondaryHoverBg: ["--button-default-hover-bg"],
  buttonSecondaryHoverColor: ["--button-default-hover-color"],
  buttonSecondaryHoverBorderColor: ["--button-default-hover-border"],
  buttonDangerBg: ["--danger-soft"],
  buttonDangerColor: ["--danger-fg"],
  buttonDangerBorderColor: ["--danger-border"],
  buttonGhostBg: ["transparent"],
  buttonGhostColor: ["--accent"],
  buttonGhostBorderColor: ["transparent"],
};

export const DEFAULT_CUSTOM_THEME_JSON = JSON.stringify(
  {
    algorithm: "light",
    token: {
      colorPrimary: "#2563eb",
      colorSuccess: "#10b981",
      colorWarning: "#f59e0b",
      colorError: "#ef4444",
      colorInfo: "#2563eb",
      colorTextBase: "#1f2328",
      colorBgBase: "#f6f7f9",
      colorBgContainer: "#ffffff",
      colorBgElevated: "#ffffff",
      colorBgLayout: "#f6f7f9",
      colorBorder: "#d1d5db",
      colorBorderSecondary: "#e5e7eb",
      borderRadius: 6,
      borderRadiusXS: 4,
      borderRadiusSM: 6,
      borderRadiusLG: 8,
      padding: 12,
      paddingSM: 8,
      paddingLG: 16,
      margin: 12,
      marginSM: 8,
      marginLG: 16,
      boxShadow: "0 1px 2px rgba(31, 35, 40, 0.06)",
      boxShadowSecondary: "0 1px 3px rgba(31, 35, 40, 0.08)",
      buttonPrimaryBg: "#2563eb",
      buttonPrimaryHoverBg: "#1d4ed8",
      buttonSecondaryBg: "#eff6ff",
      buttonSecondaryColor: "#2563eb",
      buttonSecondaryBorderColor: "#93c5fd",
      buttonDangerBg: "#fef2f2",
      buttonDangerColor: "#ef4444",
      buttonBorderRadius: 6,
      buttonShadow: "none",
    },
  },
  null,
  2,
);

function readStoredTheme(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

function readStoredCustomTheme(): string {
  return localStorage.getItem(CUSTOM_THEME_STORAGE_KEY) ?? "";
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

function isThemeAlgorithm(value: unknown): value is ThemeAlgorithm {
  return value === "light" || value === "dark" || value === "system";
}

function normalizeTokenValue(value: ThemeTokenValue, tokenName: string): string {
  if (typeof value === "number") {
    if (
      tokenName.startsWith("borderRadius") ||
      tokenName.startsWith("padding") ||
      tokenName.startsWith("margin") ||
      tokenName === "buttonPadding" ||
      tokenName === "buttonBorderRadius"
    ) {
      return `${value}px`;
    }
    return String(value);
  }
  return value.trim();
}

function toCssCustomPropertyName(tokenName: string): string {
  return `--theme-token-${tokenName.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`;
}

function parseCustomTheme(json: string): ThemeValidationResult {
  const trimmed = json.trim();
  if (!trimmed) return { config: null, error: null };

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { config: null, error: "Theme JSON must be an object." };
    }

    const input = parsed as { algorithm?: unknown; token?: unknown };
    if (input.algorithm !== undefined && !isThemeAlgorithm(input.algorithm)) {
      return { config: null, error: 'algorithm must be "light", "dark", or "system".' };
    }

    if (input.token !== undefined && (!input.token || typeof input.token !== "object" || Array.isArray(input.token))) {
      return { config: null, error: "token must be an object." };
    }

    const token: Record<string, ThemeTokenValue> = {};
    if (input.token && typeof input.token === "object" && !Array.isArray(input.token)) {
      for (const [key, value] of Object.entries(input.token)) {
        if (typeof value !== "string" && typeof value !== "number") {
          return { config: null, error: `token.${key} must be a string or number.` };
        }
        token[key] = value;
      }
    }

    return {
      config: {
        algorithm: input.algorithm,
        token,
      },
      error: null,
    };
  } catch (error) {
    return {
      config: null,
      error: error instanceof Error ? error.message : "Invalid JSON.",
    };
  }
}

function clearCustomThemeVariables() {
  const rootStyle = document.documentElement.style;
  for (const property of THEME_STYLE_PROPS) {
    rootStyle.removeProperty(property);
  }
  const customProperties: string[] = [];
  for (let index = 0; index < rootStyle.length; index += 1) {
    customProperties.push(rootStyle.item(index));
  }
  for (const property of customProperties) {
    if (property.startsWith("--theme-token-")) {
      rootStyle.removeProperty(property);
    }
  }
}

function applyCustomThemeVariables(config: CustomThemeConfig | null) {
  clearCustomThemeVariables();
  if (!config?.token) return;

  const rootStyle = document.documentElement.style;
  for (const [tokenName, rawValue] of Object.entries(config.token)) {
    const value = normalizeTokenValue(rawValue, tokenName);
    const mappedProperties = TOKEN_TO_CSS_VAR[tokenName] ?? [];

    for (const property of mappedProperties) {
      rootStyle.setProperty(property, value);
    }

    rootStyle.setProperty(toCssCustomPropertyName(tokenName), value);
  }
}

function previewCustomThemeVariables(config: CustomThemeConfig | null) {
  clearCustomThemeVariables();
  if (!config?.token) return;
  const rootStyle = document.documentElement.style;
  for (const [tokenName, rawValue] of Object.entries(config.token)) {
    const value = normalizeTokenValue(rawValue, tokenName);
    const mappedProperties = TOKEN_TO_CSS_VAR[tokenName] ?? [];
    for (const property of mappedProperties) {
      rootStyle.setProperty(property, value);
    }
    rootStyle.setProperty(toCssCustomPropertyName(tokenName), value);
  }
}

function applyThemeAttributesForPreview(config: CustomThemeConfig | null) {
  const algorithm = config?.algorithm;
  const effectiveMode =
    algorithm === "light" || algorithm === "dark" || algorithm === "system"
      ? algorithm
      : readStoredTheme();
  document.documentElement.setAttribute("data-theme", effectiveMode);
  document.documentElement.setAttribute("data-theme-resolved", resolveTheme(effectiveMode));
  document.documentElement.toggleAttribute("data-custom-theme", Boolean(config?.token));
  previewCustomThemeVariables(config);
}

function resolveModeForAttributes(mode: ThemeMode, customTheme: CustomThemeConfig | null): ThemeMode {
  if (customTheme?.algorithm === "light" || customTheme?.algorithm === "dark" || customTheme?.algorithm === "system") {
    return customTheme.algorithm;
  }
  return mode;
}

function applyThemeAttributes(mode: ThemeMode, customTheme: CustomThemeConfig | null) {
  const effectiveMode = resolveModeForAttributes(mode, customTheme);
  document.documentElement.setAttribute("data-theme", effectiveMode);
  document.documentElement.setAttribute("data-theme-resolved", resolveTheme(effectiveMode));
  document.documentElement.toggleAttribute("data-custom-theme", Boolean(customTheme?.token));
  applyCustomThemeVariables(customTheme);
}

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  customThemeJson: string;
  customThemeError: string | null;
  setMode: (mode: ThemeMode) => void;
  setCustomThemeJson: (json: string) => SetCustomThemeResult;
  resetCustomTheme: () => void;
  previewTheme: (json: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredTheme);
  const [customThemeJson, setCustomThemeJsonState] = useState(readStoredCustomTheme);
  const [{ config: customThemeConfig, error: customThemeError }, setCustomThemeValidation] =
    useState<ThemeValidationResult>(() => parseCustomTheme(readStoredCustomTheme()));
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    resolveTheme(resolveModeForAttributes(mode, customThemeConfig)),
  );

  const setMode = useCallback(
    (nextMode: ThemeMode) => {
      localStorage.setItem(STORAGE_KEY, nextMode);
      applyThemeAttributes(nextMode, customThemeConfig);
      setModeState(nextMode);
      setResolved(resolveTheme(resolveModeForAttributes(nextMode, customThemeConfig)));
    },
    [customThemeConfig],
  );

  const setCustomThemeJson = useCallback(
    (json: string): SetCustomThemeResult => {
      const validation = parseCustomTheme(json);
      if (validation.error) {
        setCustomThemeValidation(validation);
        return { ok: false, error: validation.error };
      }

      const normalizedJson = json.trim();
      if (normalizedJson) {
        localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, normalizedJson);
      } else {
        localStorage.removeItem(CUSTOM_THEME_STORAGE_KEY);
      }

      setCustomThemeJsonState(normalizedJson);
      setCustomThemeValidation(validation);
      applyThemeAttributes(mode, validation.config);
      setResolved(resolveTheme(resolveModeForAttributes(mode, validation.config)));
      return { ok: true };
    },
    [mode],
  );

  const resetCustomTheme = useCallback(() => {
    localStorage.removeItem(CUSTOM_THEME_STORAGE_KEY);
    setCustomThemeJsonState("");
    setCustomThemeValidation({ config: null, error: null });
    applyThemeAttributes(mode, null);
    setResolved(resolveTheme(mode));
  }, [mode]);

  const previewTheme = useCallback(
    (json: string) => {
      const validation = parseCustomTheme(json);
      if (validation.error) return;
      applyThemeAttributesForPreview(validation.config);
    },
    [],
  );

  useEffect(() => {
    applyThemeAttributes(mode, customThemeConfig);
    setResolved(resolveTheme(resolveModeForAttributes(mode, customThemeConfig)));

    const effectiveMode = resolveModeForAttributes(mode, customThemeConfig);
    if (effectiveMode !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    function handleChange() {
      const next = resolveTheme("system");
      document.documentElement.setAttribute("data-theme-resolved", next);
      setResolved(next);
    }
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, [mode, customThemeConfig]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolved,
      customThemeJson,
      customThemeError,
      setMode,
      setCustomThemeJson,
      resetCustomTheme,
      previewTheme,
    }),
    [customThemeError, customThemeJson, mode, previewTheme, resetCustomTheme, resolved, setCustomThemeJson, setMode],
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
