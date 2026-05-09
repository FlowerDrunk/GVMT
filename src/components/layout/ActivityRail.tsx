import type { VisibleSections } from "../../hooks/useVisibleSections";
import type { Translator } from "../../lib/i18n";

type RailIconName = "repo" | "files" | "changes" | "review" | "settings";

interface ActivityRailProps {
  visibleSections: VisibleSections;
  toggleSection: (section: keyof VisibleSections) => void;
  isLoading: boolean;
  t: Translator;
  onOpenSettings: () => void;
  onOpenThemeSettings: () => void;
}

function RailIcon({ name }: { name: RailIconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "repo":
      return (
        <svg {...common}>
          <path d="M4 19.5V5a2 2 0 0 1 2-2h11.5A2.5 2.5 0 0 1 20 5.5v13A2.5 2.5 0 0 0 17.5 16H6a2 2 0 0 0-2 2" />
          <path d="M8 7h8" />
          <path d="M8 11h6" />
        </svg>
      );
    case "files":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8" />
          <path d="M8 17h5" />
        </svg>
      );
    case "changes":
      return (
        <svg {...common}>
          <path d="M6 3v12" />
          <path d="M18 9v12" />
          <path d="M6 15l-3-3" />
          <path d="M6 15l3-3" />
          <path d="M18 9l-3 3" />
          <path d="M18 9l3 3" />
        </svg>
      );
    case "review":
      return (
        <svg {...common}>
          <path d="M9 11l2 2 4-4" />
          <path d="M21 12a9 9 0 1 1-3.7-7.28" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6A1.7 1.7 0 0 0 10.4 3V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.2.62.78 1 1.43 1H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z" />
        </svg>
      );
  }
}

export function ActivityRail({
  visibleSections,
  toggleSection,
  isLoading,
  t,
  onOpenSettings,
  onOpenThemeSettings,
}: ActivityRailProps) {
  return (
    <aside className="activity-rail" aria-label={t("activity.aria")}>
      <div className="rail-logo">G</div>
      <nav className="rail-nav">
        <button
          className={`rail-button ${visibleSections.repositories ? "active" : ""}`}
          type="button"
          title={visibleSections.repositories ? t("activity.closeRepositories") : t("activity.openRepositories")}
          aria-pressed={visibleSections.repositories}
          onClick={() => toggleSection("repositories")}
        >
          <RailIcon name="repo" />
          <small>{t("activity.repositories")}</small>
        </button>
        <button
          className={`rail-button ${visibleSections.files ? "active" : ""}`}
          type="button"
          title={visibleSections.files ? t("activity.closeFiles") : t("activity.openFiles")}
          aria-pressed={visibleSections.files}
          onClick={() => toggleSection("files")}
        >
          <RailIcon name="files" />
          <small>{t("activity.files")}</small>
        </button>
        <button
          className={`rail-button ${visibleSections.changes ? "active" : ""}`}
          type="button"
          title={visibleSections.changes ? t("activity.closeChanges") : t("activity.openChanges")}
          aria-pressed={visibleSections.changes}
          onClick={() => toggleSection("changes")}
        >
          <RailIcon name="changes" />
          <small>{t("activity.changes")}</small>
        </button>
        <button
          className="rail-button"
          type="button"
          title="打开主题设置"
          aria-pressed={false}
          onClick={onOpenThemeSettings}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="13.5" cy="6.5" r=".5"/>
            <circle cx="17.5" cy="10.5" r=".5"/>
            <circle cx="8.5" cy="7.5" r=".5"/>
            <circle cx="6.5" cy="12.5" r=".5"/>
            <path d="M12 2C6.5 2 2 5.8 2 10.5S6 19 12 19h1.5a2.5 2.5 0 0 0 0-5H12a2 2 0 0 1 0-4h1.5A2.5 2.5 0 0 0 16 7.5C16 4.5 14.3 2 12 2Z"/>
          </svg>
          <small>主题</small>
        </button>
        <button
          className={`rail-button ${visibleSections.review ? "active" : ""}`}
          type="button"
          title={visibleSections.review ? t("activity.closeReview") : t("activity.openReview")}
          aria-pressed={visibleSections.review}
          onClick={() => toggleSection("review")}
        >
          <RailIcon name="review" />
          <small>{t("activity.review")}</small>
        </button>
        <button className="rail-button" type="button" title={t("activity.settings")} onClick={onOpenSettings}>
          <RailIcon name="settings" />
          <small>{t("activity.settings")}</small>
        </button>
      </nav>
      <div className="rail-status" title={isLoading ? t("activity.busy") : t("activity.ready")}>
        <span className={isLoading ? "status-dot busy" : "status-dot"} />
      </div>
    </aside>
  );
}
