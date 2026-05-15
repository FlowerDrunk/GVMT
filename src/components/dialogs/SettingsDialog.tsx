import { useEffect, useState } from "react";
import type { AppSettings } from "../../hooks/useSettings";
import type { WindowsContextMenuStatus, GhStatus } from "../../lib/api";
import { checkGhStatus } from "../../lib/api";
import type { AppLanguage, Translator } from "../../lib/i18n";
import { DEFAULT_CUSTOM_THEME_JSON, useTheme } from "../../lib/theme";
import { Modal, ModalHeading } from "../shared/Modal";
import { Switch } from "../ui/switch";
import { Button } from "../ui/button";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  t: Translator;
  windowsContextMenuStatus: WindowsContextMenuStatus | null;
  isWindowsContextMenuLoading: boolean;
  onInstallWindowsContextMenu: () => void;
  onUninstallWindowsContextMenu: () => void;
  onRefreshWindowsContextMenu: () => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}

export function SettingsDialog({
  open,
  onClose,
  settings,
  t,
  windowsContextMenuStatus,
  isWindowsContextMenuLoading,
  onInstallWindowsContextMenu,
  onUninstallWindowsContextMenu,
  onRefreshWindowsContextMenu,
  onUpdateSettings,
}: SettingsDialogProps) {
  const titleId = "settings-dialog-title";
  const [ghStatus, setGhStatus] = useState<GhStatus | null>(null);
  const [isGhLoading, setIsGhLoading] = useState(false);
  const { customThemeJson, customThemeError, setCustomThemeJson, resetCustomTheme } = useTheme();
  const [themeDraft, setThemeDraft] = useState(customThemeJson || DEFAULT_CUSTOM_THEME_JSON);
  const [themeDraftError, setThemeDraftError] = useState<string | null>(customThemeError);

  useEffect(() => {
    if (!open) return;
    setIsGhLoading(true);
    checkGhStatus()
      .then(setGhStatus)
      .catch(() => setGhStatus(null))
      .finally(() => setIsGhLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setThemeDraft(customThemeJson || DEFAULT_CUSTOM_THEME_JSON);
    setThemeDraftError(customThemeError);
  }, [customThemeError, customThemeJson, open]);

  function handleApplyCustomTheme() {
    const result = setCustomThemeJson(themeDraft);
    setThemeDraftError(result.ok ? null : result.error ?? "Invalid theme JSON.");
  }

  function handleResetCustomTheme() {
    resetCustomTheme();
    setThemeDraft(DEFAULT_CUSTOM_THEME_JSON);
    setThemeDraftError(null);
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy={titleId} className="settings-dialog">
      <ModalHeading
        eyebrow={t("settings.eyebrow")}
        title={t("settings.title")}
        titleId={titleId}
        onClose={onClose}
      />

      <div className="settings-sections">
        <section className="settings-section theme-settings-section">
          <div className="settings-section-header">
            <svg className="settings-section-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 5.8 2 10.5S6 19 12 19h1.5a2.5 2.5 0 0 0 0-5H12a2 2 0 0 1 0-4h1.5A2.5 2.5 0 0 0 16 7.5C16 4.5 14.3 2 12 2Z"/></svg>
            <div>
              <h4>自定义主题 JSON</h4>
              <p>支持 algorithm 与 token 字段，token 会统一映射为全局 CSS 变量。</p>
            </div>
          </div>
          <textarea
            className="settings-theme-editor"
            spellCheck={false}
            value={themeDraft}
            onChange={(event) => {
              setThemeDraft(event.currentTarget.value);
              setThemeDraftError(null);
            }}
            aria-label="Custom theme JSON"
          />
          {themeDraftError ? <p className="inline-warning">{themeDraftError}</p> : null}
          <div className="settings-action-row">
            <Button variant="default" type="button" onClick={handleApplyCustomTheme}>
              应用主题
            </Button>
            <Button variant="secondary" type="button" onClick={() => setThemeDraft(DEFAULT_CUSTOM_THEME_JSON)}>
              填入示例
            </Button>
            <Button variant="ghost" type="button" onClick={handleResetCustomTheme}>
              重置主题
            </Button>
          </div>
        </section>
        {/* ── 语言 ── */}
        <section className="settings-section">
          <div className="settings-section-header">
            <svg className="settings-section-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            <div>
              <h4>{t("settings.language")}</h4>
              <p>{t("settings.languageHelp")}</p>
            </div>
          </div>
          <div className="settings-control-row">
            <span className="settings-control-label">{t("settings.languageField")}</span>
            <div className="settings-select-wrapper">
              <select
                value={settings.language}
                aria-label={t("settings.languageField")}
                onChange={(event) =>
                  onUpdateSettings({ language: event.currentTarget.value as AppLanguage })
                }
              >
                <option value="zh-CN">简体中文</option>
                <option value="en-US">English</option>
              </select>
              <svg className="settings-select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>
        </section>

        {/* ── 自动刷新 ── */}
        <section className="settings-section">
          <div className="settings-section-header">
            <svg className="settings-section-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            <div>
              <h4>{t("settings.autoRefresh")}</h4>
              <p>{t("settings.autoRefreshHelp")}</p>
            </div>
          </div>
          <div className="settings-control-row">
            <span className="settings-control-label">{t("settings.enableAutoRefresh")}</span>
            <Switch
              checked={settings.autoRefresh}
              onCheckedChange={(checked) => onUpdateSettings({ autoRefresh: checked })}
            />
          </div>
          {settings.autoRefresh ? (
            <div className="settings-control-row">
              <span className="settings-control-label">{t("settings.refreshInterval")}</span>
              <div className="settings-select-wrapper">
                <select
                  value={settings.refreshIntervalMs}
                  onChange={(event) =>
                    onUpdateSettings({ refreshIntervalMs: Number(event.currentTarget.value) })
                  }
                >
                  <option value={5000}>5 {t("settings.seconds")}</option>
                  <option value={12000}>12 {t("settings.seconds")}</option>
                  <option value={30000}>30 {t("settings.seconds")}</option>
                  <option value={60000}>60 {t("settings.seconds")}</option>
                </select>
                <svg className="settings-select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </div>
          ) : null}
        </section>

        {/* ── 远端更新检测 ── */}
        <section className="settings-section">
          <div className="settings-section-header">
            <svg className="settings-section-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <div>
              <h4>{t("settings.remoteCheck")}</h4>
              <p>{t("settings.remoteCheckHelp")}</p>
            </div>
          </div>
          <div className="settings-control-row">
            <span className="settings-control-label">{t("settings.enableRemoteCheck")}</span>
            <Switch
              checked={settings.remoteCheckEnabled}
              onCheckedChange={(checked) => onUpdateSettings({ remoteCheckEnabled: checked })}
            />
          </div>
          {settings.remoteCheckEnabled ? (
            <div className="settings-control-row">
              <span className="settings-control-label">{t("settings.remoteCheckInterval")}</span>
              <div className="settings-select-wrapper">
                <select
                  value={settings.remoteCheckIntervalMinutes}
                  onChange={(event) =>
                    onUpdateSettings({ remoteCheckIntervalMinutes: Number(event.currentTarget.value) })
                  }
                >
                  <option value={60}>{t("settings.remoteCheck1h")}</option>
                  <option value={120}>{t("settings.remoteCheck2h")}</option>
                  <option value={240}>{t("settings.remoteCheck4h")}</option>
                </select>
                <svg className="settings-select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </div>
          ) : null}
        </section>

        {/* ── SVN ── */}
        <section className="settings-section">
          <div className="settings-section-header">
            <svg className="settings-section-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2" ry="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/></svg>
            <div>
              <h4>SVN</h4>
              <p>{t("settings.svnDepthHelp")}</p>
            </div>
          </div>
          <div className="settings-control-row">
            <span className="settings-control-label">{t("settings.svnDepth")}</span>
            <div className="settings-select-wrapper">
              <select
                value={settings.svnDepth}
                onChange={(event) =>
                  onUpdateSettings({ svnDepth: event.currentTarget.value as "infinity" | "immediates" | "files" | "empty" })
                }
              >
                <option value="infinity">{t("settings.svnDepthInfinity")}</option>
                <option value="immediates">{t("settings.svnDepthImmediates")}</option>
                <option value="files">{t("settings.svnDepthFiles")}</option>
                <option value="empty">{t("settings.svnDepthEmpty")}</option>
              </select>
              <svg className="settings-select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>
        </section>

        {/* ── 变更列表 ── */}
        <section className="settings-section">
          <div className="settings-section-header">
            <svg className="settings-section-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            <div>
              <h4>{t("settings.changeList")}</h4>
              <p>{t("settings.changeListHelp")}</p>
            </div>
          </div>
          <div className="settings-control-row">
            <span className="settings-control-label">{t("settings.defaultView")}</span>
            <div className="settings-select-wrapper">
              <select
                value={settings.defaultViewMode}
                onChange={(event) =>
                  onUpdateSettings({ defaultViewMode: event.currentTarget.value as "flat" | "tree" })
                }
              >
                <option value="flat">{t("settings.flatView")}</option>
                <option value="tree">{t("settings.treeView")}</option>
              </select>
              <svg className="settings-select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>
        </section>

        {/* ── gh CLI ── */}
        <section className="settings-section">
          <div className="settings-section-header">
            <svg className="settings-section-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
            <div>
              <h4>gh CLI (GitHub)</h4>
              <p>gh 是 GitHub 官方命令行工具，用于与 GitHub 仓库交互。</p>
            </div>
          </div>
          <div className="settings-status-card">
            <div className="settings-status-dot" data-status={ghStatus?.authenticated ? "ok" : ghStatus?.installed ? "warn" : "empty"} />
            <div className="settings-status-info">
              <span className="settings-status-label">状态</span>
              <span className="settings-status-value">
                {isGhLoading ? "检测中..." : !ghStatus ? "未检测" : ghStatus.authenticated ? `已登录 (${ghStatus.authUser ?? ""})` : ghStatus.installed ? "未登录" : "未安装"}
              </span>
            </div>
            <a className="settings-external-link" href="https://cli.github.com" target="_blank" rel="noopener noreferrer" title="下载 gh CLI">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          </div>
          {ghStatus?.error ? (
            <p className="inline-warning">{ghStatus.error}</p>
          ) : null}
          {!ghStatus?.installed ? (
            <p className="settings-hint">请从 cli.github.com 安装 gh 命令行工具</p>
          ) : !ghStatus?.authenticated ? (
            <p className="settings-hint">请运行 <code>gh auth login</code> 登录 GitHub 账号</p>
          ) : null}
        </section>

        {/* ── Windows 右键菜单 ── */}
        <section className="settings-section">
          <div className="settings-section-header">
            <svg className="settings-section-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            <div>
              <h4>Windows 右键菜单</h4>
              <p>在文件夹右键显示 GVMT 子菜单，快速打开、检测、更新或提交流程。</p>
            </div>
          </div>
          <div className="settings-status-card">
            <div className="settings-status-dot" data-status={windowsContextMenuStatus?.installed ? "ok" : windowsContextMenuStatus?.supported === false ? "empty" : "warn"} />
            <div className="settings-status-info">
              <span className="settings-status-label">状态</span>
              <span className="settings-status-value">
                {!windowsContextMenuStatus
                  ? "未检测"
                  : !windowsContextMenuStatus.supported
                    ? "当前平台不支持"
                    : windowsContextMenuStatus.installed
                      ? "已安装"
                      : "未安装"}
              </span>
            </div>
          </div>
          {windowsContextMenuStatus?.executablePath ? (
            <p className="settings-path-note" title={windowsContextMenuStatus.executablePath}>
              {windowsContextMenuStatus.executablePath}
            </p>
          ) : null}
          {windowsContextMenuStatus?.warning ? (
            <p className="inline-warning">{windowsContextMenuStatus.warning}</p>
          ) : null}
          <div className="settings-action-row">
            <Button
              variant="secondary"
              type="button"
              disabled={isWindowsContextMenuLoading}
              onClick={onRefreshWindowsContextMenu}
            >
              刷新状态
            </Button>
            {windowsContextMenuStatus?.installed ? (
              <Button
                variant="destructive"
                type="button"
                disabled={isWindowsContextMenuLoading || windowsContextMenuStatus.supported === false}
                onClick={onUninstallWindowsContextMenu}
              >
                移除右键菜单
              </Button>
            ) : (
              <Button
                variant="default"
                type="button"
                disabled={isWindowsContextMenuLoading || windowsContextMenuStatus?.supported === false}
                onClick={onInstallWindowsContextMenu}
              >
                安装右键菜单
              </Button>
            )}
          </div>
        </section>
      </div>

      <div className="modal-actions">
        <Button variant="default" type="button" onClick={onClose}>
          {t("settings.done")}
        </Button>
      </div>
    </Modal>
  );
}
