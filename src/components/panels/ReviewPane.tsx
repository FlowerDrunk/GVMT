import { useCallback, useEffect, useState } from "react";
import type { Repository } from "../../lib/api";
import {
  getQualityScripts,
  saveQualityScript,
  deleteQualityScript,
  runQualityScript,
  runAllQualityScripts,
  QUALITY_SCRIPT_TEMPLATES,
  type QualityScript,
  type QualityScriptResult,
} from "../../lib/api";
import type { Translator } from "../../lib/i18n";
import { GitHubPanel } from "../workspace/GitHubPanel";
import { Button } from "../ui/button";

interface ReviewPaneProps {
  selectedRepository: Repository | undefined;
  t: Translator;
}

export function ReviewPane({ selectedRepository, t }: ReviewPaneProps) {
  const isGitRepo =
    selectedRepository?.vcsType === "git" || selectedRepository?.vcsType === "mixed";

  return (
    <aside className="context-pane">
      {isGitRepo ? (
        <ReviewCard
          icon={<GitHubIcon />}
          title="GitHub"
          summary={selectedRepository?.remoteUrl ? formatGhSummary(selectedRepository.remoteUrl) : null}
          t={t}
        >
          <GitHubPanel selectedRepository={selectedRepository} t={t} />
        </ReviewCard>
      ) : null}

      <QualityScriptsCard selectedRepository={selectedRepository} t={t} />
    </aside>
  );
}

// ── ReviewCard wrapper ──────────────────────────────────────────────────

function ReviewCard({ icon, title, summary, children, t }: {
  icon: React.ReactNode;
  title: string;
  summary?: string | null;
  children: React.ReactNode;
  t: Translator;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="review-card">
      <button className="review-card-header" type="button" onClick={() => setOpen(!open)}>
        <span className="review-card-icon">{icon}</span>
        <strong className="review-card-title">{title}</strong>
        {summary ? <span className="review-card-summary">{summary}</span> : null}
        <span className="review-card-arrow" data-open={open}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
      </button>
      {open ? <div className="review-card-body">{children}</div> : null}
    </section>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function formatGhSummary(remoteUrl: string): string {
  const parts = remoteUrl.split("/");
  return parts.slice(-2).join("/").replace(".git", "");
}

// ── Quality Scripts Card ────────────────────────────────────────────────

function QualityScriptsCard({ selectedRepository, t }: ReviewPaneProps) {
  const [scripts, setScripts] = useState<QualityScript[]>([]);
  const [results, setResults] = useState<Partial<Record<number, QualityScriptResult>>>({});
  const [runningIds, setRunningIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editName, setEditName] = useState("");
  const [editShell, setEditShell] = useState<"cmd" | "powershell">("cmd");
  const [editScript, setEditScript] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);

  const loadScripts = useCallback(async () => {
    if (!selectedRepository) { setScripts([]); return; }
    try {
      const data = await getQualityScripts(selectedRepository.id);
      setScripts(data);
    } catch { /* ignore */ }
  }, [selectedRepository?.id]);

  useEffect(() => { void loadScripts(); }, [loadScripts]);

  async function handleRun(id: number) {
    setRunningIds((s) => new Set(s).add(id));
    try {
      const result = await runQualityScript(id);
      setResults((r) => ({ ...r, [id]: result }));
    } catch { /* ignore */ }
    setRunningIds((s) => { const next = new Set(s); next.delete(id); return next; });
    void loadScripts();
  }

  async function handleRunAll() {
    if (!selectedRepository) return;
    const enabled = scripts.filter((s) => s.enabled);
    setRunningIds(new Set(enabled.map((s) => s.id)));
    setCardOpen(true); // auto-expand when running all
    try {
      const allResults = await runAllQualityScripts(selectedRepository.id);
      for (const r of allResults) { setResults((prev) => ({ ...prev, [r.scriptId]: r })); }
    } catch { /* ignore */ }
    setRunningIds(new Set());
    void loadScripts();
  }

  function startAdd() { setIsAdding(true); setEditingId(null); setEditName(""); setEditShell("cmd"); setEditScript(""); setCardOpen(true); }
  function startEdit(s: QualityScript) { setIsAdding(false); setEditingId(s.id); setEditName(s.name); setEditShell(s.shell); setEditScript(s.script); setCardOpen(true); }

  async function handleSaveEdit() {
    if (!selectedRepository || !editName.trim()) return;
    await saveQualityScript({ repositoryId: selectedRepository.id, name: editName.trim(), enabled: true, shell: editShell, script: editScript });
    setIsAdding(false); setEditingId(null); void loadScripts();
  }
  async function handleDelete(id: number) { await deleteQualityScript(id); void loadScripts(); }
  function applyTemplate(name: string, shell: "cmd" | "powershell", script: string) {
    setEditName(name); setEditShell(shell); setEditScript(script); setShowTemplates(false); setCardOpen(true);
  }

  const passCount = Object.values(results).filter((r) => r?.success).length;
  const failCount = Object.values(results).filter((r) => r && !r.success).length;
  const summary = scripts.length > 0 ? `${passCount} ${t("review.passed")} / ${failCount} ${t("review.failed")}` : null;

  return (
    <section className="review-card">
      <button className="review-card-header" type="button" onClick={() => setCardOpen(!cardOpen)}>
        <span className="review-card-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        </span>
        <strong className="review-card-title">{t("review.qualityScripts")}</strong>
        {summary ? <span className="review-card-summary">{summary}</span> : null}
        <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); handleRunAll(); }}
          disabled={!selectedRepository || scripts.filter((s) => s.enabled).length === 0}>
          {t("review.runAll")}
        </Button>
        <span className="review-card-arrow" data-open={cardOpen}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
      </button>
      {cardOpen ? (
        <div className="review-card-body">
          <div className="template-picker">
            <Button variant="secondary" onClick={startAdd} disabled={!selectedRepository}>{t("review.addScript")}</Button>
            <Button variant="secondary" onClick={() => setShowTemplates(!showTemplates)} disabled={editingId === null && !isAdding}>{t("review.fromTemplate")} ▾</Button>
            {showTemplates && (
              <div className="template-dropdown">
                {QUALITY_SCRIPT_TEMPLATES.map((tmpl, i) => (
                  <button key={i} onClick={() => applyTemplate(tmpl.name, tmpl.shell, tmpl.script)}>{tmpl.name}</button>
                ))}
              </div>
            )}
          </div>

          {(editingId !== null || isAdding) && (
            <div className="script-editor">
              <input className="script-name-input" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={t("review.namePlaceholder")} />
              <select value={editShell} onChange={(e) => setEditShell(e.target.value as "cmd" | "powershell")}>
                <option value="cmd">CMD</option><option value="powershell">PowerShell</option>
              </select>
              <textarea value={editScript} onChange={(e) => setEditScript(e.target.value)} placeholder={t("review.scriptPlaceholder")} rows={3} />
              <div className="script-editor-actions">
                <Button variant="secondary" onClick={handleSaveEdit}>{t("review.save")}</Button>
                <Button variant="secondary" onClick={() => { setEditingId(null); setIsAdding(false); setEditName(""); }}>{t("commit.cancel")}</Button>
              </div>
            </div>
          )}

          <div className="quality-script-list">
            {scripts.length === 0 ? (
              <p className="quality-script-empty">{selectedRepository ? t("changes.noMatch") : t("review.notSelected")}</p>
            ) : (
              scripts.map((s) => {
                const running = runningIds.has(s.id);
                const result = results[s.id];
                const statusIcon = running ? "⏳" : result ? (result.success ? "✓" : "✗") : "-";
                const statusLabel = running ? t("general.loading") : result ? (result.success ? t("review.passed") : t("review.failed")) : "-";
                return (
                  <div className="quality-script-item" key={s.id}>
                    <div className="qsi-main">
                      <span className={`qsi-status ${result?.success ? "pass" : result ? "fail" : ""}`}>{statusIcon} {statusLabel}</span>
                      <strong>{s.name}</strong><code>{s.shell}</code>
                      {result ? <small>{result.durationMs}ms</small> : null}
                    </div>
                    <div className="qsi-actions">
                      <Button variant="secondary" onClick={() => handleRun(s.id)} disabled={running}>{running ? "..." : t("review.run")}</Button>
                      <Button variant="secondary" onClick={() => startEdit(s)}>{t("review.edit")}</Button>
                      <Button variant="secondary" onClick={() => handleDelete(s.id)}>{t("review.deleteScript")}</Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
