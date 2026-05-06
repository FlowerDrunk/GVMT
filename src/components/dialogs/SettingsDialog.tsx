import type { AppSettings } from "../../hooks/useSettings";
import { Modal, ModalHeading } from "../shared/Modal";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}

export function SettingsDialog({
  open,
  onClose,
  settings,
  onUpdateSettings,
}: SettingsDialogProps) {
  const titleId = "settings-dialog-title";

  return (
    <Modal open={open} onClose={onClose} labelledBy={titleId} className="settings-dialog">
      <ModalHeading
        eyebrow="Application"
        title="设置"
        titleId={titleId}
        onClose={onClose}
      />

      <div className="settings-sections">
        <section className="settings-section">
          <h4>自动刷新</h4>
          <p>定时检测当前仓库的工作区状态变更。</p>
          <label className="settings-toggle-row">
            <input
              type="checkbox"
              checked={settings.autoRefresh}
              onChange={(event) => onUpdateSettings({ autoRefresh: event.currentTarget.checked })}
            />
            <span>启用自动刷新</span>
          </label>
          {settings.autoRefresh ? (
            <label className="settings-field">
              <span>刷新间隔（秒）</span>
              <select
                value={settings.refreshIntervalMs}
                onChange={(event) =>
                  onUpdateSettings({ refreshIntervalMs: Number(event.currentTarget.value) })
                }
              >
                <option value={5000}>5 秒</option>
                <option value={12000}>12 秒</option>
                <option value={30000}>30 秒</option>
                <option value={60000}>60 秒</option>
              </select>
            </label>
          ) : null}
        </section>

        <section className="settings-section">
          <h4>变更列表</h4>
          <p>变更面板默认使用的展示方式。</p>
          <label className="settings-field">
            <span>默认视图</span>
            <select
              value={settings.defaultViewMode}
              onChange={(event) =>
                onUpdateSettings({ defaultViewMode: event.currentTarget.value as "flat" | "tree" })
              }
            >
              <option value="flat">路径分组</option>
              <option value="tree">树形展开</option>
            </select>
          </label>
        </section>
      </div>

      <div className="modal-actions">
        <button className="primary-button" type="button" onClick={onClose}>
          完成
        </button>
      </div>
    </Modal>
  );
}
