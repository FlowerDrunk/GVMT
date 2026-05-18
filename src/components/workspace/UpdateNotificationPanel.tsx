import { useEffect, useRef, useState } from "react";
import { checkRemoteUpdates, updateRepository, type RemoteUpdateStatus, type Repository } from "../../lib/api";
import type { AppSettings } from "../../hooks/useSettings";
import type { Translator } from "../../lib/i18n";

interface RepoUpdateInfo {
  repository: Repository;
  remoteStatus: RemoteUpdateStatus;
}

interface UpdateNotificationPanelProps {
  repositories: Repository[];
  settings: AppSettings;
  onUpdateCompleted: () => void;
  t: Translator;
}

export function UpdateNotificationPanel({ repositories, settings, onUpdateCompleted, t }: UpdateNotificationPanelProps) {
  const [notifications, setNotifications] = useState<RepoUpdateInfo[]>([]);
  const [isUpdating, setIsUpdating] = useState<Set<number>>(new Set());
  const dismissedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!settings.remoteCheckEnabled) {
      setNotifications([]);
      return;
    }

    const intervalMs = settings.remoteCheckIntervalMinutes * 60 * 1000;

    const timer = setInterval(async () => {
      const results: RepoUpdateInfo[] = [];
      for (const repo of repositories) {
        try {
          const status = await checkRemoteUpdates(repo.id);
          if (status.hasUpdates) {
            results.push({ repository: repo, remoteStatus: status });
          }
        } catch {
          // ignore
        }
      }
      setNotifications((prev) => {
        const updated = results.filter((r) => !dismissedRef.current.has(r.repository.id));
        const existing = prev.filter(
          (p) => !dismissedRef.current.has(p.repository.id) && results.some((r) => r.repository.id === p.repository.id),
        );
        const merged = [...existing];
        for (const r of updated) {
          if (!merged.some((m) => m.repository.id === r.repository.id)) {
            merged.push(r);
          }
        }
        return merged;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [repositories, settings.remoteCheckEnabled, settings.remoteCheckIntervalMinutes]);

  async function handleUpdate(repoId: number) {
    setIsUpdating((prev) => new Set(prev).add(repoId));
    try {
      await updateRepository(repoId);
      dismissedRef.current.add(repoId);
      setNotifications((prev) => prev.filter((n) => n.repository.id !== repoId));
      onUpdateCompleted();
    } catch {
      // keep notification so user can retry
    } finally {
      setIsUpdating((prev) => {
        const next = new Set(prev);
        next.delete(repoId);
        return next;
      });
    }
  }

  function handleDismiss(repoId: number) {
    dismissedRef.current.add(repoId);
    setNotifications((prev) => prev.filter((n) => n.repository.id !== repoId));
  }

  if (notifications.length === 0) return null;

  return (
    <div className="update-notification-container">
      {notifications.map((n) => (
        <div key={n.repository.id} className="update-notification-card">
          <div className="update-notification-header">
            <div className="update-notification-info">
              <strong className="update-notification-repo">{n.repository.name}</strong>
              <span className="update-notification-desc">{n.remoteStatus.details ?? t("notification.remoteUpdateAvailable")}</span>
            </div>
            <button className="update-notification-close" type="button" onClick={() => handleDismiss(n.repository.id)} title={t("ui.close")}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
          <button
            className="update-notification-btn"
            type="button"
            disabled={isUpdating.has(n.repository.id)}
            onClick={() => handleUpdate(n.repository.id)}
          >
            {isUpdating.has(n.repository.id) ? t("notification.updating") : t("notification.update")}
          </button>
        </div>
      ))}
    </div>
  );
}
