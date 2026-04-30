import type { VisibleSections } from "../../hooks/useVisibleSections";

interface ActivityRailProps {
  visibleSections: VisibleSections;
  toggleSection: (section: keyof VisibleSections) => void;
  themeMode: "light" | "dark" | "system";
  setThemeMode: (mode: "light" | "dark" | "system") => void;
  isLoading: boolean;
}

export function ActivityRail({
  visibleSections,
  toggleSection,
  themeMode,
  setThemeMode,
  isLoading,
}: ActivityRailProps) {
  return (
    <aside className="activity-rail" aria-label="主导航">
      <div className="rail-logo">G</div>
      <nav className="rail-nav">
        <button
          className={`rail-button ${visibleSections.repositories ? "active" : ""}`}
          type="button"
          title={visibleSections.repositories ? "关闭仓库管理" : "打开仓库管理"}
          aria-pressed={visibleSections.repositories}
          onClick={() => toggleSection("repositories")}
        >
          <span aria-hidden="true">□</span>
          <small>仓库</small>
        </button>
        <button
          className={`rail-button ${visibleSections.files ? "active" : ""}`}
          type="button"
          title={visibleSections.files ? "关闭文件浏览" : "打开文件浏览"}
          aria-pressed={visibleSections.files}
          onClick={() => toggleSection("files")}
        >
          <span aria-hidden="true">▤</span>
          <small>文件</small>
        </button>
        <button
          className={`rail-button ${visibleSections.changes ? "active" : ""}`}
          type="button"
          title={visibleSections.changes ? "关闭变更状态" : "打开变更状态"}
          aria-pressed={visibleSections.changes}
          onClick={() => toggleSection("changes")}
        >
          <span aria-hidden="true">✓</span>
          <small>变更</small>
        </button>
        <button
          className={`rail-button ${visibleSections.review ? "active" : ""}`}
          type="button"
          title={visibleSections.review ? "关闭评审质量" : "打开评审质量"}
          aria-pressed={visibleSections.review}
          onClick={() => toggleSection("review")}
        >
          <span aria-hidden="true">◎</span>
          <small>评审</small>
        </button>
        <button className="rail-button" type="button" title="设置" disabled>
          <span aria-hidden="true">⚙</span>
          <small>设置</small>
        </button>
        <button
          className="rail-button"
          type="button"
          title={
            themeMode === "light" ? "浅色主题" : themeMode === "dark" ? "深色主题" : "跟随系统"
          }
          onClick={() => {
            const next =
              themeMode === "light" ? "dark" : themeMode === "dark" ? "system" : "light";
            setThemeMode(next);
          }}
        >
          <span aria-hidden="true">{themeMode === "light" ? "☀" : themeMode === "dark" ? "☾" : "⊡"}</span>
          <small>{themeMode === "light" ? "浅色" : themeMode === "dark" ? "深色" : "系统"}</small>
        </button>
      </nav>
      <div className="rail-status" title={isLoading ? "处理中" : "准备就绪"}>
        <span className={isLoading ? "status-dot busy" : "status-dot"} />
      </div>
    </aside>
  );
}
