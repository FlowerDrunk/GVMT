import type { VisibleSections } from "../../hooks/useVisibleSections";
import type { Translator } from "../../lib/i18n";

interface ActivityRailProps {
  visibleSections: VisibleSections;
  toggleSection: (section: keyof VisibleSections) => void;
  themeMode: "light" | "dark" | "system";
  setThemeMode: (mode: "light" | "dark" | "system") => void;
  isLoading: boolean;
  t: Translator;
  onOpenSettings: () => void;
}

export function ActivityRail({
  visibleSections,
  toggleSection,
  themeMode,
  setThemeMode,
  isLoading,
  t,
  onOpenSettings,
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
          <span aria-hidden="true">□</span>
          <small>{t("activity.repositories")}</small>
        </button>
        <button
          className={`rail-button ${visibleSections.files ? "active" : ""}`}
          type="button"
          title={visibleSections.files ? t("activity.closeFiles") : t("activity.openFiles")}
          aria-pressed={visibleSections.files}
          onClick={() => toggleSection("files")}
        >
          <span aria-hidden="true">▤</span>
          <small>{t("activity.files")}</small>
        </button>
        <button
          className={`rail-button ${visibleSections.changes ? "active" : ""}`}
          type="button"
          title={visibleSections.changes ? t("activity.closeChanges") : t("activity.openChanges")}
          aria-pressed={visibleSections.changes}
          onClick={() => toggleSection("changes")}
        >
          <span aria-hidden="true">✓</span>
          <small>{t("activity.changes")}</small>
        </button>
        <button
          className={`rail-button ${visibleSections.review ? "active" : ""}`}
          type="button"
          title={visibleSections.review ? t("activity.closeReview") : t("activity.openReview")}
          aria-pressed={visibleSections.review}
          onClick={() => toggleSection("review")}
        >
          <span aria-hidden="true">◎</span>
          <small>{t("activity.review")}</small>
        </button>
        <button className="rail-button" type="button" title={t("activity.settings")} onClick={onOpenSettings}>
          <span aria-hidden="true">⚙</span>
          <small>{t("activity.settings")}</small>
        </button>
        <button
          className="rail-button"
          type="button"
          title={
            themeMode === "light" ? t("activity.light") : themeMode === "dark" ? t("activity.dark") : t("activity.system")
          }
          onClick={() => {
            const next =
              themeMode === "light" ? "dark" : themeMode === "dark" ? "system" : "light";
            setThemeMode(next);
          }}
        >
          <span aria-hidden="true">{themeMode === "light" ? "☀" : themeMode === "dark" ? "☾" : "⊡"}</span>
          <small>{themeMode === "light" ? t("activity.light") : themeMode === "dark" ? t("activity.dark") : t("activity.system")}</small>
        </button>
      </nav>
      <div className="rail-status" title={isLoading ? t("activity.busy") : t("activity.ready")}>
        <span className={isLoading ? "status-dot busy" : "status-dot"} />
      </div>
    </aside>
  );
}
