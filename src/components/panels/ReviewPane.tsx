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
        <GitHubPanel selectedRepository={selectedRepository} t={t} />
      ) : null}

      <QualityScriptsSection selectedRepository={selectedRepository} t={t} />
    </aside>
  );
}

// ── Quality Scripts Section ──────────────────────────────────────────────

function QualityScriptsSection({ selectedRepository, t }: ReviewPaneProps) {
  const [scripts, setScripts] = useState<QualityScript[]>([]);
  const [results, setResults] = useState<Partial<Record<number, QualityScriptResult>>>({});
  const [runningIds, setRunningIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editName, setEditName] = useState("");
  const [editShell, setEditShell] = useState<"cmd" | "powershell">("cmd");
  const [editScript, setEditScript] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);

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
    try {
      const allResults = await runAllQualityScripts(selectedRepository.id);
      for (const r of allResults) { setResults((prev) => ({ ...prev, [r.scriptId]: r })); }
    } catch { /* ignore */ }
    setRunningIds(new Set());
    void loadScripts();
  }

  function startAdd() {
    setIsAdding(true);
    setEditingId(null);
    setEditName("");
    setEditShell("cmd");
    setEditScript("");
  }

  function startEdit(s: QualityScript) {
    setIsAdding(false);
    setEditingId(s.id);
    setEditName(s.name);
    setEditShell(s.shell);
    setEditScript(s.script);
  }

  async function handleSaveEdit() {
    if (!selectedRepository || !editName.trim()) return;
    await saveQualityScript({
      repositoryId: selectedRepository.id,
      name: editName.trim(),
      enabled: true,
      shell: editShell,
      script: editScript,
    });
    setIsAdding(false);
    setEditingId(null);
    void loadScripts();
  }

  async function handleDelete(id: number) {
    await deleteQualityScript(id);
    void loadScripts();
  }

  function applyTemplate(name: string, shell: "cmd" | "powershell", script: string) {
    setEditName(name);
    setEditShell(shell);
    setEditScript(script);
    setShowTemplates(false);
  }

  return (
    <section className="context-section quality-scripts-section">
      <div className="review-title-row">
        <h3>{t("review.qualityScripts")}</h3>
        <span>
          <Button variant="secondary" onClick={startAdd} disabled={!selectedRepository}>{t("review.addScript")}</Button>
          <Button variant="secondary" onClick={handleRunAll} disabled={!selectedRepository || scripts.filter((s) => s.enabled).length === 0}>{t("review.runAll")}</Button>
        </span>
      </div>

      {/* Template picker */}
      <div className="template-picker">
        <Button variant="secondary" onClick={() => setShowTemplates(!showTemplates)}>{t("review.fromTemplate")} ▾</Button>
        {showTemplates && (
          <div className="template-dropdown">
            {QUALITY_SCRIPT_TEMPLATES.map((tmpl, i) => (
              <button key={i} onClick={() => applyTemplate(tmpl.name, tmpl.shell, tmpl.script)}>
                {tmpl.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Edit panel */}
      {(editingId !== null || isAdding) && (
        <div className="script-editor">
          <input
            className="script-name-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder={t("review.namePlaceholder")}
          />
          <select value={editShell} onChange={(e) => setEditShell(e.target.value as "cmd" | "powershell")}>
            <option value="cmd">CMD</option>
            <option value="powershell">PowerShell</option>
          </select>
          <textarea
            value={editScript}
            onChange={(e) => setEditScript(e.target.value)}
            placeholder={t("review.scriptPlaceholder")}
            rows={3}
          />
          <div className="script-editor-actions">
            <Button variant="secondary" onClick={handleSaveEdit}>{t("review.save")}</Button>
            <Button variant="secondary" onClick={() => { setEditingId(null); setIsAdding(false); setEditName(""); }}>{t("commit.cancel")}</Button>
          </div>
        </div>
      )}

      {/* Script list */}
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
                  <span className={`qsi-status ${result?.success ? "pass" : result ? "fail" : ""}`}>
                    {statusIcon} {statusLabel}
                  </span>
                  <strong>{s.name}</strong>
                  <code>{s.shell}</code>
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
    </section>
  );
}
