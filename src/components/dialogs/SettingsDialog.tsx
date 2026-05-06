import type { AppSettings } from "../../hooks/useSettings";
import type { WindowsContextMenuStatus } from "../../lib/api";
import type { AppLanguage, Translator } from "../../lib/i18n";
import { Modal, ModalHeading } from "../shared/Modal";

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

  return (
    <Modal open={open} onClose={onClose} labelledBy={titleId} className="settings-dialog">
      <ModalHeading
        eyebrow={t("settings.eyebrow")}
        title={t("settings.title")}
        titleId={titleId}
        onClose={onClose}
      />

      <div className="settings-sections">
        <section className="settings-section">
          <h4>{t("settings.language")}</h4>
          <p>{t("settings.languageHelp")}</p>
          <label className="settings-field">
            <span>{t("settings.languageField")}</span>
            <select
              value={settings.language}
              onChange={(event) =>
                onUpdateSettings({ language: event.currentTarget.value as AppLanguage })
              }
            >
              <option value="zh-CN">简体中文</option>
              <option value="en-US">English</option>
            </select>
          </label>
        </section>

        <section className="settings-section">
          <h4>{t("settings.autoRefresh")}</h4>
          <p>{t("settings.autoRefreshHelp")}</p>
          <label className="settings-toggle-row">
            <input
              type="checkbox"
              checked={settings.autoRefresh}
              onChange={(event) => onUpdateSettings({ autoRefresh: event.currentTarget.checked })}
            />
            <span>{t("settings.enableAutoRefresh")}</span>
          </label>
          {settings.autoRefresh ? (
            <label className="settings-field">
              <span>{t("settings.refreshInterval")}</span>
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
            </label>
          ) : null}
        </section>

        <section className="settings-section">
          <h4>{t("settings.changeList")}</h4>
          <p>{t("settings.changeListHelp")}</p>
          <label className="settings-field">
            <span>{t("settings.defaultView")}</span>
            <select
              value={settings.defaultViewMode}
              onChange={(event) =>
                onUpdateSettings({ defaultViewMode: event.currentTarget.value as "flat" | "tree" })
              }
            >
              <option value="flat">{t("settings.flatView")}</option>
              <option value="tree">{t("settings.treeView")}</option>
            </select>
          </label>
        </section>

        <section className="settings-section">
          <h4>Windows 右键菜单</h4>
          <p>在文件夹和文件夹空白处右键显示 GVMT 子菜单，可快速打开、检测、更新或进入提交流程。</p>
          <div className="settings-status-row">
            <span>状态</span>
            <strong>
              {!windowsContextMenuStatus
                ? "未检测"
                : !windowsContextMenuStatus.supported
                  ? "当前平台不支持"
                  : windowsContextMenuStatus.installed
                    ? "已安装"
                    : "未安装"}
            </strong>
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
            <button
              className="secondary-button"
              type="button"
              disabled={isWindowsContextMenuLoading}
              onClick={onRefreshWindowsContextMenu}
            >
              刷新状态
            </button>
            {windowsContextMenuStatus?.installed ? (
              <button
                className="danger-button"
                type="button"
                disabled={isWindowsContextMenuLoading || windowsContextMenuStatus.supported === false}
                onClick={onUninstallWindowsContextMenu}
              >
                移除右键菜单
              </button>
            ) : (
              <button
                className="primary-button"
                type="button"
                disabled={isWindowsContextMenuLoading || windowsContextMenuStatus?.supported === false}
                onClick={onInstallWindowsContextMenu}
              >
                安装右键菜单
              </button>
            )}
          </div>
        </section>
      </div>

      <div className="modal-actions">
        <button className="primary-button" type="button" onClick={onClose}>
          {t("settings.done")}
        </button>
      </div>
    </Modal>
  );
}
