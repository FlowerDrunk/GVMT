import { useEffect, useRef, useState } from "react";
import type { AppSettings } from "../../hooks/useSettings";
import type { Translator } from "../../lib/i18n";
import {
  DEFAULT_CUSTOM_THEME_JSON,
  useTheme,
} from "../../lib/theme";
import { Button } from "../ui/button";
import { Modal, ModalHeading } from "../shared/Modal";

interface ThemePaneProps {
  open: boolean;
  onClose: () => void;
  t: Translator;
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}

/* ── saved themes persistence ── */

const SAVED_THEMES_KEY = "gvmt-saved-themes";

interface SavedTheme {
  name: string;
  json: string;
  color: string;
  bgColor: string;
}

function loadSavedThemes(): SavedTheme[] {
  try {
    const raw = localStorage.getItem(SAVED_THEMES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSavedThemes(themes: SavedTheme[]) {
  localStorage.setItem(SAVED_THEMES_KEY, JSON.stringify(themes));
}

function extractPrimaryColor(json: string): string {
  try {
    const parsed = JSON.parse(json);
    return parsed?.token?.colorPrimary || parsed?.token?.buttonPrimaryBg || "#888";
  } catch {
    return "#888";
  }
}

function extractBgColor(json: string): string {
  try {
    const parsed = JSON.parse(json);
    return parsed?.token?.colorPrimaryBg || parsed?.token?.colorBgBase || "#eee";
  } catch {
    return "#eee";
  }
}

/* ── presets ── */

interface Preset {
  name: string;
  label: string;
  json: string;
  color: string;
  bgColor: string;
}

const THEME_PRESETS: Preset[] = [
  {
    name: "default",
    label: "默认",
    color: "#2563eb",
    bgColor: "#f6f7f9",
    json: DEFAULT_CUSTOM_THEME_JSON,
  },
  {
    name: "candy",
    label: "糖果粉",
    color: "#ff6b9d",
    bgColor: "#fff0f5",
    json: JSON.stringify({ algorithm: "light", token: { colorPrimary: "#ff6b9d", colorPrimaryHover: "#f8578f", colorPrimaryActive: "#e84a82", colorPrimaryBg: "#fff0f5", colorPrimaryBgHover: "#ffe0ec", colorPrimaryBorder: "#ffb3cc", colorPrimaryBorderHover: "#ff8cb2", colorSuccess: "#51cf66", colorError: "#ff6b6b", colorErrorBg: "#fff0f0", colorErrorBorder: "#ffc9c9", colorTextBase: "#2d2d2d", colorBgBase: "#fcf7f0", colorBgContainer: "#ffffff", colorBorder: "#f0d5b8", colorBorderSecondary: "#f5e0cc", borderRadius: 8, borderRadiusSM: 6, borderRadiusLG: 12, buttonPrimaryBg: "#ff6b9d", buttonPrimaryHoverBg: "#f8578f", buttonSecondaryBg: "#fff0f5", buttonSecondaryColor: "#ff6b9d", buttonSecondaryBorderColor: "#ffb3cc", buttonBorderRadius: 8 } }),
  },
  {
    name: "forest",
    label: "森林绿",
    color: "#2b9348",
    bgColor: "#edf7f0",
    json: JSON.stringify({ algorithm: "light", token: { colorPrimary: "#2b9348", colorPrimaryHover: "#1a7a36", colorPrimaryActive: "#0f5d27", colorPrimaryBg: "#edf7f0", colorPrimaryBgHover: "#d8efe0", colorPrimaryBorder: "#a3d9b1", colorPrimaryBorderHover: "#6cbd84", colorSuccess: "#38b000", colorError: "#e63946", colorErrorBg: "#fce4e6", colorErrorBorder: "#f5b7bd", colorTextBase: "#1a3320", colorBgBase: "#f5faf6", colorBgContainer: "#ffffff", colorBorder: "#c8e0cf", colorBorderSecondary: "#dcebe1", borderRadius: 8, borderRadiusSM: 6, borderRadiusLG: 12, buttonPrimaryBg: "#2b9348", buttonPrimaryHoverBg: "#1a7a36", buttonSecondaryBg: "#edf7f0", buttonSecondaryColor: "#2b9348", buttonSecondaryBorderColor: "#a3d9b1", buttonBorderRadius: 8 } }),
  },
  {
    name: "ocean",
    label: "深海蓝",
    color: "#0a58ca",
    bgColor: "#e8f0fe",
    json: JSON.stringify({ algorithm: "light", token: { colorPrimary: "#0a58ca", colorPrimaryHover: "#084298", colorPrimaryActive: "#063170", colorPrimaryBg: "#e8f0fe", colorPrimaryBgHover: "#d2e2fc", colorPrimaryBorder: "#9ac1f0", colorPrimaryBorderHover: "#6ba3e8", colorSuccess: "#0f973d", colorError: "#dc3545", colorErrorBg: "#fce4e8", colorErrorBorder: "#f3b7c0", colorTextBase: "#0a1e2f", colorBgBase: "#f0f4f8", colorBgContainer: "#ffffff", colorBorder: "#c8d8e8", colorBorderSecondary: "#dce6f0", borderRadius: 6, borderRadiusSM: 4, borderRadiusLG: 10, buttonPrimaryBg: "#0a58ca", buttonPrimaryHoverBg: "#084298", buttonSecondaryBg: "#e8f0fe", buttonSecondaryColor: "#0a58ca", buttonSecondaryBorderColor: "#9ac1f0", buttonBorderRadius: 6 } }),
  },
  {
    name: "sunset",
    label: "日落橙",
    color: "#e8590c",
    bgColor: "#fff4e6",
    json: JSON.stringify({ algorithm: "light", token: { colorPrimary: "#e8590c", colorPrimaryHover: "#d9480f", colorPrimaryActive: "#c73a0a", colorPrimaryBg: "#fff4e6", colorPrimaryBgHover: "#ffe8cc", colorPrimaryBorder: "#ffc078", colorPrimaryBorderHover: "#ffa94d", colorSuccess: "#2f9e44", colorError: "#e03131", colorErrorBg: "#ffe0e0", colorErrorBorder: "#ffb3b3", colorTextBase: "#2e1a0a", colorBgBase: "#fef9f2", colorBgContainer: "#ffffff", colorBorder: "#f0d5b8", colorBorderSecondary: "#f5e0cc", borderRadius: 8, borderRadiusSM: 6, borderRadiusLG: 12, buttonPrimaryBg: "#e8590c", buttonPrimaryHoverBg: "#d9480f", buttonSecondaryBg: "#fff4e6", buttonSecondaryColor: "#e8590c", buttonSecondaryBorderColor: "#ffc078", buttonBorderRadius: 8 } }),
  },
  {
    name: "eva",
    label: "EVA",
    color: "#8a2be2",
    bgColor: "#1a0a2e",
    json: JSON.stringify({ algorithm: "dark", token: { colorPrimary: "#8a2be2", colorPrimaryHover: "#9d4edd", colorPrimaryActive: "#7b2d8e", colorPrimaryBg: "#1a0a2e", colorPrimaryBgHover: "#2d1b4e", colorPrimaryBorder: "#6a1b9a", colorPrimaryBorderHover: "#8a2be2", colorSuccess: "#00e676", colorError: "#ff1744", colorErrorBg: "#2a0a0a", colorErrorBorder: "#5f0f0f", colorTextBase: "#e0e0e0", colorBgBase: "#0d0d0d", colorBgContainer: "#1a1a2e", colorBgElevated: "#16213e", colorBorder: "#2a2a4a", colorBorderSecondary: "#1f1f3a", borderRadius: 6, borderRadiusSM: 4, borderRadiusLG: 10, boxShadow: "0 2px 8px rgba(138, 43, 226, 0.3)", buttonPrimaryBg: "#8a2be2", buttonPrimaryHoverBg: "#9d4edd", buttonSecondaryBg: "#1a0a2e", buttonSecondaryColor: "#8a2be2", buttonSecondaryBorderColor: "#6a1b9a", buttonBorderRadius: 6 } }),
  },
  {
    name: "vscode",
    label: "VSCode",
    color: "#007acc",
    bgColor: "#1e1e1e",
    json: JSON.stringify({ algorithm: "dark", token: { colorPrimary: "#007acc", colorPrimaryHover: "#1a8ad4", colorPrimaryActive: "#0062a3", colorPrimaryBg: "#1e1e1e", colorPrimaryBgHover: "#252526", colorPrimaryBorder: "#007acc", colorPrimaryBorderHover: "#1a8ad4", colorSuccess: "#4ec9b0", colorError: "#f44747", colorErrorBg: "#2d0a0a", colorErrorBorder: "#5a1d1d", colorTextBase: "#cccccc", colorBgBase: "#252526", colorBgContainer: "#1e1e1e", colorBgElevated: "#2d2d2d", colorBorder: "#3c3c3c", colorBorderSecondary: "#333333", borderRadius: 4, borderRadiusSM: 3, borderRadiusLG: 6, boxShadow: "0 2px 8px rgba(0, 0, 0, 0.4)", buttonPrimaryBg: "#0e639c", buttonPrimaryHoverBg: "#1177bb", buttonSecondaryBg: "#3c3c3c", buttonSecondaryColor: "#cccccc", buttonSecondaryBorderColor: "#5a5a5a", buttonBorderRadius: 4 } }),
  },
  {
    name: "github",
    label: "GitHub",
    color: "#0969da",
    bgColor: "#f6f8fa",
    json: JSON.stringify({ algorithm: "light", token: { colorPrimary: "#0969da", colorPrimaryHover: "#0550ae", colorPrimaryActive: "#044289", colorPrimaryBg: "#ddf4ff", colorPrimaryBgHover: "#b6e3ff", colorPrimaryBorder: "#80ccff", colorPrimaryBorderHover: "#54aeff", colorSuccess: "#1a7f37", colorError: "#cf222e", colorErrorBg: "#ffebe9", colorErrorBorder: "#ffaba8", colorTextBase: "#1f2328", colorBgBase: "#f6f8fa", colorBgContainer: "#ffffff", colorBgElevated: "#ffffff", colorBorder: "#d0d7de", colorBorderSecondary: "#d8dee4", borderRadius: 6, borderRadiusSM: 4, borderRadiusLG: 8, boxShadow: "0 1px 3px rgba(31,35,40,0.12)", buttonPrimaryBg: "#1f883d", buttonPrimaryHoverBg: "#1a7f37", buttonSecondaryBg: "#f6f8fa", buttonSecondaryColor: "#24292f", buttonSecondaryBorderColor: "#d0d7de", buttonBorderRadius: 6 } }),
  },
  {
    name: "github-dark",
    label: "GitHub Dark",
    color: "#58a6ff",
    bgColor: "#0d1117",
    json: JSON.stringify({ algorithm: "dark", token: { colorPrimary: "#58a6ff", colorPrimaryHover: "#79c0ff", colorPrimaryActive: "#1f6feb", colorPrimaryBg: "#0d1117", colorPrimaryBgHover: "#161b22", colorPrimaryBorder: "#30363d", colorPrimaryBorderHover: "#58a6ff", colorSuccess: "#3fb950", colorError: "#f85149", colorErrorBg: "#290a0a", colorErrorBorder: "#581a1a", colorTextBase: "#c9d1d9", colorBgBase: "#0d1117", colorBgContainer: "#161b22", colorBgElevated: "#1c2128", colorBorder: "#30363d", colorBorderSecondary: "#21262d", borderRadius: 6, borderRadiusSM: 4, borderRadiusLG: 8, boxShadow: "0 1px 3px rgba(1,4,9,0.4)", buttonPrimaryBg: "#238636", buttonPrimaryHoverBg: "#2ea043", buttonSecondaryBg: "#21262d", buttonSecondaryColor: "#c9d1d9", buttonSecondaryBorderColor: "#30363d", buttonBorderRadius: 6 } }),
  },
  {
    name: "monokai",
    label: "Monokai",
    color: "#a6e22e",
    bgColor: "#272822",
    json: JSON.stringify({ algorithm: "dark", token: { colorPrimary: "#a6e22e", colorPrimaryHover: "#b6f040", colorPrimaryActive: "#8fca1a", colorPrimaryBg: "#272822", colorPrimaryBgHover: "#3e3d32", colorPrimaryBorder: "#4a4a3d", colorPrimaryBorderHover: "#a6e22e", colorSuccess: "#66d9ef", colorError: "#f92672", colorErrorBg: "#2a0a1a", colorErrorBorder: "#5a1535", colorTextBase: "#f8f8f2", colorBgBase: "#272822", colorBgContainer: "#1e1f1c", colorBgElevated: "#3e3d32", colorBorder: "#4a4a3d", colorBorderSecondary: "#3e3d32", borderRadius: 4, borderRadiusSM: 2, borderRadiusLG: 6, boxShadow: "0 2px 8px rgba(0,0,0,0.5)", buttonPrimaryBg: "#a6e22e", buttonPrimaryHoverBg: "#b6f040", buttonSecondaryBg: "#3e3d32", buttonSecondaryColor: "#f8f8f2", buttonSecondaryBorderColor: "#5a5a4a", buttonBorderRadius: 4 } }),
  },
  {
    name: "dracula",
    label: "Dracula",
    color: "#bd93f9",
    bgColor: "#282a36",
    json: JSON.stringify({ algorithm: "dark", token: { colorPrimary: "#bd93f9", colorPrimaryHover: "#caa9fa", colorPrimaryActive: "#a679f2", colorPrimaryBg: "#282a36", colorPrimaryBgHover: "#3a3c4a", colorPrimaryBorder: "#6272a4", colorPrimaryBorderHover: "#bd93f9", colorSuccess: "#50fa7b", colorError: "#ff5555", colorErrorBg: "#2a1010", colorErrorBorder: "#5a2020", colorTextBase: "#f8f8f2", colorBgBase: "#282a36", colorBgContainer: "#1e1f2b", colorBgElevated: "#343746", colorBorder: "#44475a", colorBorderSecondary: "#3a3c4e", borderRadius: 6, borderRadiusSM: 4, borderRadiusLG: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.4)", buttonPrimaryBg: "#bd93f9", buttonPrimaryHoverBg: "#caa9fa", buttonSecondaryBg: "#343746", buttonSecondaryColor: "#f8f8f2", buttonSecondaryBorderColor: "#6272a4", buttonBorderRadius: 6 } }),
  },
  {
    name: "nord",
    label: "Nord",
    color: "#88c0d0",
    bgColor: "#2e3440",
    json: JSON.stringify({ algorithm: "dark", token: { colorPrimary: "#88c0d0", colorPrimaryHover: "#a3d6e5", colorPrimaryActive: "#6ca8b8", colorPrimaryBg: "#2e3440", colorPrimaryBgHover: "#3b4252", colorPrimaryBorder: "#4c566a", colorPrimaryBorderHover: "#88c0d0", colorSuccess: "#a3be8c", colorError: "#bf616a", colorErrorBg: "#2a1518", colorErrorBorder: "#5a2a30", colorTextBase: "#eceff4", colorBgBase: "#2e3440", colorBgContainer: "#242933", colorBgElevated: "#3b4252", colorBorder: "#4c566a", colorBorderSecondary: "#434c5e", borderRadius: 6, borderRadiusSM: 4, borderRadiusLG: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.3)", buttonPrimaryBg: "#5e81ac", buttonPrimaryHoverBg: "#7ba0c4", buttonSecondaryBg: "#3b4252", buttonSecondaryColor: "#eceff4", buttonSecondaryBorderColor: "#4c566a", buttonBorderRadius: 6 } }),
  },
  {
    name: "solarized",
    label: "Solarized",
    color: "#268bd2",
    bgColor: "#002b36",
    json: JSON.stringify({ algorithm: "dark", token: { colorPrimary: "#268bd2", colorPrimaryHover: "#3a9ad9", colorPrimaryActive: "#1a7ab8", colorPrimaryBg: "#002b36", colorPrimaryBgHover: "#073642", colorPrimaryBorder: "#586e75", colorPrimaryBorderHover: "#268bd2", colorSuccess: "#859900", colorError: "#dc322f", colorErrorBg: "#1a0a0a", colorErrorBorder: "#4a1a18", colorTextBase: "#839496", colorBgBase: "#002b36", colorBgContainer: "#073642", colorBgElevated: "#094050", colorBorder: "#586e75", colorBorderSecondary: "#475b62", borderRadius: 4, borderRadiusSM: 2, borderRadiusLG: 6, boxShadow: "0 2px 6px rgba(0,0,0,0.4)", buttonPrimaryBg: "#268bd2", buttonPrimaryHoverBg: "#3a9ad9", buttonSecondaryBg: "#073642", buttonSecondaryColor: "#839496", buttonSecondaryBorderColor: "#586e75", buttonBorderRadius: 4 } }),
  },
];

/* ── helpers used by JSX ── */

function getTokenValue(json: string, key: string, fallback: string): string {
  try {
    const parsed = JSON.parse(json);
    const val = parsed?.token?.[key];
    return typeof val === "string" ? val : fallback;
  } catch {
    return fallback;
  }
}

function getNumericToken(json: string, key: string, fallback: number): number {
  try {
    const parsed = JSON.parse(json);
    const val = parsed?.token?.[key];
    return typeof val === "number" ? val : fallback;
  } catch {
    return fallback;
  }
}

function updateToken(json: string, key: string, value: string | number): string {
  try {
    const parsed = json.trim() ? JSON.parse(json) : {};
    if (!parsed.token) parsed.token = {};
    parsed.token[key] = value;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return json;
  }
}

/* ── component ── */

export function ThemeDialog({ open, onClose, t, settings, onUpdateSettings }: ThemePaneProps) {
  const { customThemeJson, customThemeError, setCustomThemeJson, resetCustomTheme, previewTheme } = useTheme();

  // The initial "applied" JSON — user's last saved theme, or "" = no custom theme
  const [appliedJson, setAppliedJson] = useState(customThemeJson || "");
  // The working draft — tracks unsaved changes
  const [themeDraft, setThemeDraft] = useState(appliedJson);
  const themeDraftRef = useRef(themeDraft);
  themeDraftRef.current = themeDraft;
  const [themeDraftError, setThemeDraftError] = useState<string | null>(customThemeError);
  const [savedThemes, setSavedThemes] = useState<SavedTheme[]>(loadSavedThemes);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveName, setSaveName] = useState("");

  // Has the draft diverged from what's applied?
  const hasUnsavedChanges = themeDraft !== appliedJson;

  // Revert preview when dialog closes without applying
  useEffect(() => {
    if (!open) {
      previewTheme(appliedJson);
    }
  }, [open, appliedJson, previewTheme]);

  /** Persist to localStorage + apply to CSS */
  function applyJson(json: string) {
    const result = setCustomThemeJson(json);
    setAppliedJson(json);
    setThemeDraft(json);
    themeDraftRef.current = json;
    setThemeDraftError(result.ok ? null : result.error ?? "Invalid theme JSON.");
  }

  /** Preview changes in CSS without persisting */
  function previewJson(json: string) {
    setThemeDraft(json);
    themeDraftRef.current = json;
    setThemeDraftError(null);
    previewTheme(json);
  }

  function handleApply() {
    applyJson(themeDraft);
  }

  /** Reset draft back to the last-applied JSON (undo all unsaved changes) */
  function handleResetDraft() {
    setThemeDraft(appliedJson);
    themeDraftRef.current = appliedJson;
    setThemeDraftError(null);
    previewTheme(appliedJson);
  }

  /** Full reset: clear custom theme, revert to CSS :root defaults */
  function handleResetAll() {
    resetCustomTheme();
    setAppliedJson("");
    setThemeDraft("");
    themeDraftRef.current = "";
    setThemeDraftError(null);
  }

  function handleSelectPreset(preset: Preset) {
    applyJson(preset.json);
  }

  function handleSelectSavedTheme(theme: SavedTheme) {
    applyJson(theme.json);
  }

  function handleSaveCustomTheme() {
    const name = saveName.trim();
    if (!name) return;
    const color = extractPrimaryColor(themeDraft);
    const bgColor = extractBgColor(themeDraft);
    const updated: SavedTheme[] = [...savedThemes.filter((t) => t.name !== name), { name, json: themeDraft, color, bgColor }];
    setSavedThemes(updated);
    saveSavedThemes(updated);
    setSaveName("");
    setShowSaveInput(false);
    applyJson(themeDraft);
  }

  function handleDeleteSavedTheme(name: string, e: React.MouseEvent) {
    e.stopPropagation();
    const updated = savedThemes.filter((t) => t.name !== name);
    setSavedThemes(updated);
    saveSavedThemes(updated);
  }

  return (
    <Modal open={open} onClose={onClose} className="theme-dialog">
      <ModalHeading
        eyebrow="Appearance"
        title="主题设置"
        titleId="theme-dialog-title"
        onClose={onClose}
        t={t}
      />
      <div className="theme-dialog-body">
        {/* ── 预设主题 ── */}
        <section className="theme-dialog-section">
          <div className="section-title"><span>预设主题</span></div>
          <div className="theme-preset-grid">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className="theme-preset-card"
                onClick={() => handleSelectPreset(preset)}
                title={preset.label}
              >
                <span className="theme-preset-swatch" style={{ backgroundColor: preset.color }} />
                <span className="theme-preset-label">{preset.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── 已保存的主题 ── */}
        {savedThemes.length > 0 ? (
          <section className="theme-dialog-section">
            <div className="section-title"><span>已保存</span></div>
            <div className="theme-preset-grid">
              {savedThemes.map((theme) => (
                <button
                  key={theme.name}
                  type="button"
                  className="theme-preset-card"
                  onClick={() => handleSelectSavedTheme(theme)}
                  title={theme.name}
                >
                  <span className="theme-preset-swatch" style={{ backgroundColor: theme.color }} />
                  <span className="theme-preset-label">{theme.name}</span>
                  <button
                    type="button"
                    className="theme-preset-card-delete"
                    title="删除"
                    onClick={(e) => handleDeleteSavedTheme(theme.name, e)}
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                    </svg>
                  </button>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── 可视化调整 ── */}
        <section className="theme-dialog-section">
          <div className="section-title"><span>可视化调整</span></div>

          <div className="theme-visual-row">
            <label className="theme-visual-label">
              <span>主色调</span>
              <div className="theme-color-picker-row">
                <input type="color" className="theme-color-input"
                  value={getTokenValue(themeDraft, "colorPrimary", "#2563eb")}
                  onChange={(e) => { previewJson(updateToken(themeDraftRef.current, "colorPrimary", e.target.value)); }} />
                <span className="theme-color-hex">{getTokenValue(themeDraft, "colorPrimary", "#2563eb")}</span>
              </div>
            </label>
          </div>

          <div className="theme-visual-row">
            <label className="theme-visual-label">
              <span>主色悬停</span>
              <div className="theme-color-picker-row">
                <input type="color" className="theme-color-input"
                  value={getTokenValue(themeDraft, "colorPrimaryHover", "#1d4ed8")}
                  onChange={(e) => { previewJson(updateToken(themeDraftRef.current, "colorPrimaryHover", e.target.value)); }} />
                <span className="theme-color-hex">{getTokenValue(themeDraft, "colorPrimaryHover", "#1d4ed8")}</span>
              </div>
            </label>
          </div>

          <div className="theme-visual-row">
            <label className="theme-visual-label">
              <span>背景色</span>
              <div className="theme-color-picker-row">
                <input type="color" className="theme-color-input"
                  value={getTokenValue(themeDraft, "colorBgBase", "#f6f7f9")}
                  onChange={(e) => { previewJson(updateToken(themeDraftRef.current, "colorBgBase", e.target.value)); }} />
                <span className="theme-color-hex">{getTokenValue(themeDraft, "colorBgBase", "#f6f7f9")}</span>
              </div>
            </label>
          </div>

          <div className="theme-visual-row">
            <label className="theme-visual-label">
              <span>卡片背景</span>
              <div className="theme-color-picker-row">
                <input type="color" className="theme-color-input"
                  value={getTokenValue(themeDraft, "colorBgContainer", "#ffffff")}
                  onChange={(e) => { previewJson(updateToken(themeDraftRef.current, "colorBgContainer", e.target.value)); }} />
                <span className="theme-color-hex">{getTokenValue(themeDraft, "colorBgContainer", "#ffffff")}</span>
              </div>
            </label>
          </div>

          <div className="theme-visual-row">
            <label className="theme-visual-label">
              <span>边框色</span>
              <div className="theme-color-picker-row">
                <input type="color" className="theme-color-input"
                  value={getTokenValue(themeDraft, "colorBorder", "#d1d5db")}
                  onChange={(e) => { previewJson(updateToken(themeDraftRef.current, "colorBorder", e.target.value)); }} />
                <span className="theme-color-hex">{getTokenValue(themeDraft, "colorBorder", "#d1d5db")}</span>
              </div>
            </label>
          </div>

          <div className="theme-visual-row">
            <label className="theme-visual-label">
              <span>圆角</span>
              <input type="range" className="theme-range-input" min="2" max="24" step="1"
                value={getNumericToken(themeDraft, "borderRadius", 6)}
                onChange={(e) => { previewJson(updateToken(themeDraftRef.current, "borderRadius", Number(e.target.value))); }} />
              <span className="theme-range-value">{getNumericToken(themeDraft, "borderRadius", 6)}px</span>
            </label>
          </div>

          <div className="theme-visual-row">
            <label className="theme-visual-label">
              <span>按钮圆角</span>
              <input type="range" className="theme-range-input" min="2" max="20" step="1"
                value={getNumericToken(themeDraft, "buttonBorderRadius", 6)}
                onChange={(e) => { previewJson(updateToken(themeDraftRef.current, "buttonBorderRadius", Number(e.target.value))); }} />
              <span className="theme-range-value">{getNumericToken(themeDraft, "buttonBorderRadius", 6)}px</span>
            </label>
          </div>

          {/* unsaved changes indicator + apply / reset buttons */}
          <div className="theme-visual-actions">
            <div className={`theme-unsaved-badge ${hasUnsavedChanges ? "visible" : ""}`}>
              有未保存的修改
            </div>
            <div className="theme-visual-buttons">
              <Button variant="default" size="sm" type="button" onClick={handleApply} disabled={!hasUnsavedChanges}>
                应用修改
              </Button>
              <Button variant="ghost" size="sm" type="button" onClick={handleResetDraft} disabled={!hasUnsavedChanges}>
                撤销修改
              </Button>
            </div>
          </div>
        </section>

        {/* ── 保存新主题 ── */}
        <section className="theme-dialog-section">
          <div className="theme-save-row">
            <Button variant="secondary" size="sm" type="button" onClick={() => { handleApply(); setShowSaveInput(!showSaveInput); setSaveName(""); }}>
              {showSaveInput ? "取消" : "保存为新主题"}
            </Button>
          </div>
          {showSaveInput ? (
            <div className="theme-save-form">
              <input
                className="theme-save-input" type="text"
                placeholder="输入主题名称..."
                value={saveName}
                onChange={(e) => setSaveName(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveCustomTheme(); }}
                autoFocus
              />
              <Button variant="default" type="button" size="sm" onClick={handleSaveCustomTheme} disabled={!saveName.trim()}>
                保存
              </Button>
            </div>
          ) : null}
        </section>

        {/* ── 设置 ── */}
        <section className="theme-dialog-section">
          <div className="section-title"><span>设置</span></div>
          <div className="theme-setting-row">
            <label className="theme-setting-label">
              <span>语言</span>
              <select className="theme-select" value={settings.language}
                onChange={(e) => onUpdateSettings({ language: e.currentTarget.value as "zh-CN" | "en-US" })}>
                <option value="zh-CN">简体中文</option>
                <option value="en-US">English</option>
              </select>
            </label>
          </div>
          <div className="theme-setting-row">
            <label className="theme-setting-label">
              <span>变更列表</span>
              <select className="theme-select" value={settings.defaultViewMode}
                onChange={(e) => onUpdateSettings({ defaultViewMode: e.currentTarget.value as "flat" | "tree" })}>
                <option value="flat">平铺</option>
                <option value="tree">树形</option>
              </select>
            </label>
          </div>
        </section>

      </div>
    </Modal>
  );
}

