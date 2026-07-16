import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CommitDetail, GitCommitLog, GitStashEntry, OperationResult, Repository } from "../../lib/api";
import { gitFetch, gitLog, gitShowDetail, gitStashDrop, gitStashList, gitStashPop, gitStashPush, openInExplorer, svnCleanup, svnLog, svnShowDetail } from "../../lib/api";
import { getVcsLabels } from "../../lib/constants";
import type { Translator } from "../../lib/i18n";
import { Modal, ModalHeading } from "../shared/Modal";
import { DiffCodeBlock } from "../shared/CodeBlock";
import { ChangeBadge } from "../shared/ChangeBadge";

interface CommandBarProps {
  selectedRepository: Repository | undefined;
  currentChangeCount: number;
  currentReviewState: string;
  isLoading: boolean;
  isIgnoreLoading: boolean;
  canOpenCommitDialog: boolean;
  isCommitLoading: boolean;
  t: Translator;
  latestSvnRevisions?: Record<number, string>;
  onRefreshSelected: () => void;
  onLoadRepositoryStatus: () => void;
  onUpdateRepository: () => void;
  onForceUpdateRepository: () => void;
  onOpenIgnoreDialog: () => void;
  onOpenCommitDialog: () => void;
  onOpenSettings: () => void;
  onSwitchBranch: () => void;
  onOperationResult: (result: OperationResult) => void;
  onStashChanged: () => void;
}

// ── SVG 图标 ──

function RefreshIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>; }
function CommitIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/></svg>; }
function IgnoreIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>; }
function FetchIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>; }
function StashIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M4 12l8 8 8-8"/></svg>; }
function LogIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>; }
function UpdateIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.5 15a9 9 0 1 1-2.3-9.8"/></svg>; }
function CleanIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>; }
function SettingsIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>; }
function FolderIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>; }
function ChevronDown() { return <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>; }

export function CommandBar({
  selectedRepository,
  currentChangeCount,
  currentReviewState,
  isLoading,
  isIgnoreLoading,
  canOpenCommitDialog,
  isCommitLoading,
  t,
  latestSvnRevisions = {},
  onRefreshSelected,
  onLoadRepositoryStatus,
  onUpdateRepository,
  onForceUpdateRepository,
  onOpenIgnoreDialog,
  onOpenCommitDialog,
  onOpenSettings,
  onSwitchBranch,
  onOperationResult,
  onStashChanged,
}: CommandBarProps) {
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [logs, setLogs] = useState<GitCommitLog[]>([]);
  const [isLogLoading, setIsLogLoading] = useState(false);
  const [isStashMenuOpen, setIsStashMenuOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [stashEntries, setStashEntries] = useState<GitStashEntry[]>([]);
  const stashMenuRef = useRef<HTMLDivElement>(null);
  const logMenuRef = useRef<HTMLDivElement>(null);
  const isGitRepo = selectedRepository?.vcsType === "git" || selectedRepository?.vcsType === "mixed";
  const isSvnRepo = selectedRepository?.vcsType === "svn" || selectedRepository?.vcsType === "mixed";
  const repoUsable = selectedRepository ? selectedRepository.pathExists : false;
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [forceUpdateConfirm, setForceUpdateConfirm] = useState(false);

  // ── Log detail & context menu state ──
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, CommitDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [logMenu, setLogMenu] = useState<{ x: number; y: number; entry: GitCommitLog } | null>(null);
  const repoId = selectedRepository?.id;

  const closeLogMenu = useCallback(() => setLogMenu(null), []);

  // 切换仓库时清理上一个仓库遗留的日志/详情/stash 状态，避免 detailCache 无限累积
  useEffect(() => {
    setLogs([]);
    setStashEntries([]);
    setExpandedIdx(null);
    setDetailCache({});
    setLogMenu(null);
    setIsLogOpen(false);
  }, [repoId]);

  useEffect(() => {
    if (!logMenu) return;
    function onClick(e: MouseEvent) {
      if (logMenuRef.current && !logMenuRef.current.contains(e.target as Node)) closeLogMenu();
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [logMenu, closeLogMenu]);

  async function loadDetail(idx: number, entry: GitCommitLog) {
    if (!repoId) return;
    const cacheKey = entry.hash;
    if (detailCache[cacheKey]) return;
    setDetailLoading(cacheKey);
    try {
      const isSvn = entry.hash.startsWith("r");
      const detail = isSvn
        ? await svnShowDetail(repoId, parseInt(entry.hash.slice(1), 10))
        : await gitShowDetail(repoId, entry.hash);
      setDetailCache((prev) => ({ ...prev, [cacheKey]: detail }));
    } catch {
      // silently ignore load failures
    } finally {
      setDetailLoading(null);
    }
  }

  function handleLogItemClick(idx: number) {
    const entry = logs[idx];
    if (!entry) return;
    if (expandedIdx === idx) {
      setExpandedIdx(null);
      return;
    }
    setExpandedIdx(idx);
    loadDetail(idx, entry);
  }

  function handleLogContextMenu(e: React.MouseEvent, idx: number) {
    e.preventDefault();
    const entry = logs[idx];
    if (!entry) return;
    setLogMenu({ x: e.clientX, y: e.clientY, entry });
  }

  function handleCopyHash() {
    if (logMenu) {
      navigator.clipboard.writeText(logMenu.entry.hash).catch(() => {});
    }
    closeLogMenu();
  }

  async function handleGitFetch() {
    if (!selectedRepository) return;
    setIsFetching(true);
    try { const r = await gitFetch(selectedRepository.id); onOperationResult(r); } finally { setIsFetching(false); }
  }

  async function handleStashPush() {
    if (!selectedRepository) return;
    const r = await gitStashPush(selectedRepository.id);
    onOperationResult(r); onStashChanged(); setIsStashMenuOpen(false);
  }

  async function handleStashPop() {
    if (!selectedRepository) return;
    const r = await gitStashPop(selectedRepository.id);
    onOperationResult(r); onStashChanged(); setIsStashMenuOpen(false);
  }

  async function handleStashDrop(index: number) {
    if (!selectedRepository) return;
    onOperationResult(await gitStashDrop(selectedRepository.id, index));
    onStashChanged();
  }

  async function handleOpenGitLog() {
    if (!selectedRepository) return;
    setIsLogOpen(true); setIsLogLoading(true);
    try { setLogs(await gitLog(selectedRepository.id, 20)); } finally { setIsLogLoading(false); }
  }

  async function handleSvnCleanup() {
    if (!selectedRepository) return;
    setIsCleaningUp(true);
    try { onOperationResult(await svnCleanup(selectedRepository.id)); } finally { setIsCleaningUp(false); }
  }

  async function handleOpenExplorer() {
    if (!selectedRepository?.path) return;
    try { await openInExplorer(selectedRepository.path); } catch { /* ignore */ }
  }

  async function handleOpenSvnLog() {
    if (!selectedRepository) return;
    setIsLogOpen(true); setIsLogLoading(true);
    try {
      const entries = await svnLog(selectedRepository.id, 20);
      setLogs(entries.map((e) => ({ hash: `r${e.revision}`, author: e.author, date: e.date, message: e.message })));
    } finally { setIsLogLoading(false); }
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (stashMenuRef.current && !stashMenuRef.current.contains(event.target as Node)) setIsStashMenuOpen(false);
    }
    if (isStashMenuOpen) { document.addEventListener("mousedown", handleClickOutside); gitStashList(selectedRepository!.id).then(setStashEntries); }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isStashMenuOpen, selectedRepository?.id]);

  return (
    <header className="command-bar">
      <div className="command-info">
        <span className={`repo-dot ${selectedRepository ? (selectedRepository.vcsType === "unknown" ? "warning" : "ready") : "warning"}`} />
        <strong className="command-repo-name">{selectedRepository?.name ?? t("command.selectRepository")}</strong>
        {selectedRepository ? (
          <>
            <span className={`cmd-vcs-tag ${selectedRepository.vcsType}`}>{getVcsLabels(t)[selectedRepository.vcsType]}</span>
            {(() => {
              const rev = latestSvnRevisions[selectedRepository.id] ?? selectedRepository.branchOrRevision;
              return rev ? (
                <button className="cmd-rev-btn" type="button" onClick={onSwitchBranch}>{rev}</button>
              ) : null;
            })()}
          </>
        ) : null}
      </div>

      <div className="command-actions">
        {isGitRepo ? (
          <div className="cmd-group">
            <button className="cmd-btn" type="button" disabled={!selectedRepository || !repoUsable || isFetching} onClick={handleGitFetch} title={t("command.fetch")}>
              <FetchIcon /><span>{t("command.fetch")}</span>
            </button>
            <div className="cmd-stash-wrap" ref={stashMenuRef}>
              <button className="cmd-btn" type="button" disabled={!selectedRepository || !repoUsable} onClick={() => setIsStashMenuOpen(!isStashMenuOpen)} title={t("command.stash")}>
                <StashIcon /><span>{t("command.stash")}</span><ChevronDown />
              </button>
              {isStashMenuOpen ? (
                <div className="stash-menu-dropdown">
                  <button type="button" onClick={handleStashPush}><StashIcon /><span>{t("command.stashPush")}</span></button>
                  <button type="button" onClick={handleStashPop}><StashIcon /><span>{t("command.stashPop")}</span></button>
                  <div className="stash-menu-divider" />
                  <div className="stash-menu-label">{t("command.stash")}</div>
                  {stashEntries.length === 0 ? <div className="stash-menu-empty">{t("command.stashEmpty")}</div>
                  : stashEntries.slice(0, 5).map((entry) => (
                    <div className="stash-menu-item" key={entry.index}>
                      <span className="stash-menu-msg">{entry.message.length > 30 ? entry.message.slice(0, 30) + "…" : entry.message}</span>
                      <button className="stash-menu-drop-btn cmd-danger" type="button" onClick={() => handleStashDrop(entry.index)} title={t("command.stashDrop")}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="cmd-group">
          <button className="cmd-btn cmd-icon-only" type="button" disabled={!selectedRepository || !repoUsable || isLoading} onClick={onLoadRepositoryStatus} title={t("command.refreshStatus")}>
            <RefreshIcon />
          </button>
          {isGitRepo ? (
            <button className="cmd-btn cmd-icon-only" type="button" disabled={!selectedRepository || !repoUsable} onClick={handleOpenGitLog} title={t("command.log")}>
              <LogIcon />
            </button>
          ) : isSvnRepo ? (
            <button className="cmd-btn cmd-icon-only" type="button" disabled={!selectedRepository || !repoUsable} onClick={handleOpenSvnLog} title={t("command.log")}>
              <LogIcon />
            </button>
          ) : null}
          <button className="cmd-btn cmd-icon-only" type="button" disabled={!selectedRepository || !repoUsable || isIgnoreLoading} onClick={onOpenIgnoreDialog} title={t("command.ignore")}>
            <IgnoreIcon />
          </button>
          <button className="cmd-btn cmd-icon-only" type="button" disabled={!selectedRepository?.path || !repoUsable} onClick={handleOpenExplorer} title={t("command.openFolder")}>
            <FolderIcon />
          </button>
        </div>

        <span className="cmd-divider" />

        {isSvnRepo ? (
          <div className="cmd-group">
            <button className="cmd-btn cmd-btn-warn" type="button" disabled={!selectedRepository || !repoUsable || isCleaningUp} onClick={handleSvnCleanup} title={t("command.cleanup")}>
              <CleanIcon /><span>{t("command.cleanup")}</span>
            </button>
            {forceUpdateConfirm ? (
              <div className="cmd-confirm-inline">
                <span>确认强制更新？</span>
                <button className="cmd-btn cmd-btn-danger" type="button" disabled={!selectedRepository || !repoUsable || isLoading}
                  onClick={() => { onForceUpdateRepository(); setForceUpdateConfirm(false); }}>确认</button>
                <button className="cmd-btn" type="button" onClick={() => setForceUpdateConfirm(false)}>取消</button>
              </div>
            ) : (
              <button className="cmd-btn cmd-btn-danger" type="button" disabled={!selectedRepository || !repoUsable || isLoading}
                onClick={() => setForceUpdateConfirm(true)} title={t("contextMenu.forceUpdate")}>
                <UpdateIcon /><span>{t("contextMenu.forceUpdate")}</span>
              </button>
            )}
          </div>
        ) : null}

        <div className="cmd-group">
          <button className="cmd-btn cmd-btn-accent" type="button" disabled={!selectedRepository || !repoUsable || isLoading} onClick={onUpdateRepository} title={t("command.update")}>
            <UpdateIcon /><span>{t("command.update")}</span>
          </button>
          <button className="cmd-btn cmd-btn-primary" type="button" disabled={!canOpenCommitDialog || !repoUsable || isCommitLoading} onClick={onOpenCommitDialog} title={t("command.commit")}>
            <CommitIcon /><span>{t("command.commit")}</span>
          </button>
        </div>

        <button className="cmd-btn cmd-icon-only" type="button" onClick={onOpenSettings} title={t("activity.settings")}>
          <SettingsIcon />
        </button>
      </div>

      {/* ── Log 弹窗 ── */}
      <Modal open={isLogOpen} onClose={() => { setIsLogOpen(false); setExpandedIdx(null); }} labelledBy="git-log-title" className="git-log-modal">
        <ModalHeading eyebrow="History" title={t("command.logTitle")} titleId="git-log-title" onClose={() => { setIsLogOpen(false); setExpandedIdx(null); }} t={t} />
        <div className="git-log-list">
          {isLogLoading ? <p className="git-log-loading">{t("command.logLoading")}</p>
          : logs.length === 0 ? <p className="git-log-empty">{t("command.logEmpty")}</p>
          : logs.map((entry, idx) => {
              const isExpanded = expandedIdx === idx;
              const detail = detailCache[entry.hash];
              const isLoading = detailLoading === entry.hash;
              return (
                <div key={idx}>
                  <div
                    className={`git-log-item ${isExpanded ? "git-log-item--expanded" : ""}`}
                    onClick={() => handleLogItemClick(idx)}
                    onContextMenu={(e) => handleLogContextMenu(e, idx)}
                  >
                    <code className="git-log-hash">{entry.hash.slice(0, 7)}</code>
                    <strong className="git-log-msg">{entry.message}</strong>
                    <div className="git-log-meta">
                      <span>{entry.author}</span>
                      <time>{formatLogDate(entry.date)}</time>
                    </div>
                  </div>
                  {isExpanded ? (
                    <div className="git-log-detail">
                      {isLoading ? (
                        <p className="git-log-detail-loading">Loading…</p>
                      ) : detail ? (
                        <>
                          {detail.diff ? (
                            <LogDiffSection diff={detail.diff} t={t} />
                          ) : detail.files.length > 0 ? (
                            <div className="git-log-files">
                              <span className="git-log-files-label">{t("general.changedFiles", { count: detail.files.length })}</span>
                              <div className="git-log-files-list">
                                {detail.files.map((f, fi) => (
                                  <span key={fi} className={`change-badge ${f.changeType}`}>{f.path}</span>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {!detail.files.length && !detail.diff ? (
                            <p className="git-log-detail-empty">No details available</p>
                          ) : null}
                        </>
                      ) : (
                        <p className="git-log-detail-empty">Failed to load details</p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
        </div>

        {/* ── Log context menu ── */}
        {logMenu ? (
          <div className="context-menu" ref={logMenuRef} style={{ left: logMenu.x, top: logMenu.y, position: "fixed", zIndex: 9999 }}>
            <button type="button" onClick={() => { handleLogItemClick(logs.indexOf(logMenu.entry)); closeLogMenu(); }}>
              {t("ui.viewDetail")}
            </button>
            <button type="button" onClick={handleCopyHash}>
              {t("ui.copyRevision")}
            </button>
          </div>
        ) : null}
      </Modal>
    </header>
  );
}

function LogDiffSection({ diff, t }: { diff: string; t: Translator }) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffDialogFile, setDiffDialogFile] = useState<{ path: string; diff: string; changeType: string } | null>(null);
  const perFileDiffs = useMemo(() => parsePerFileDiffs(diff), [diff]);
  const groups = useMemo(() => {
    const map = new Map<string, { prefix: string; files: { path: string; name: string; changeType: string }[] }>();
    for (const f of perFileDiffs) {
      const clean = f.path.replace(/\\/g, "/");
      const lastSlash = clean.lastIndexOf("/");
      const dir = lastSlash > 0 ? clean.substring(0, lastSlash) : "";
      const name = lastSlash > 0 ? clean.substring(lastSlash + 1) : clean;
      const prefix = dir ? `${dir}/` : "";
      if (!map.has(prefix)) map.set(prefix, { prefix, files: [] });
      map.get(prefix)!.files.push({ path: f.path, name, changeType: f.changeType });
    }
    return [...map.values()].sort((a, b) => a.prefix.localeCompare(b.prefix));
  }, [perFileDiffs]);

  const hasValidPaths = perFileDiffs.some((f: { path: string }) => f.path);
  if (perFileDiffs.length === 0 || !hasValidPaths) {
    return (
      <div className="git-log-diff-area">
        <button className="git-log-diff-toggle" type="button" onClick={() => {
          const entry = perFileDiffs[0];
          setDiffDialogFile({ path: "__all__", diff, changeType: "modified" });
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: "rotate(0deg)", transition: "transform 150ms ease" }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
          查看 Diff
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="git-log-diff-area">
        {groups.map((group) => (
          <div className="flat-group" key={group.prefix}>
            {group.prefix ? (
              <div className="flat-group-header" title={group.prefix}>
                <svg className="flat-folder-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <span>{group.prefix}</span>
              </div>
            ) : null}
            {group.files.map((f) => (
              <button
                key={f.path}
                className={`change-row flat ${selectedFile === f.path ? "selected" : ""}`}
                type="button"
                onClick={() => setSelectedFile(selectedFile === f.path ? null : f.path)}
                onDoubleClick={() => {
                  const d = perFileDiffs.find((pf: { path: string }) => pf.path === f.path);
                  setDiffDialogFile({ path: f.path, diff: d?.diff ?? "", changeType: f.changeType });
                }}
              >
                <span className={`change-badge ${f.changeType}`}>{f.changeType}</span>
                <span className="change-path">{f.name}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <Modal open={diffDialogFile !== null} onClose={() => setDiffDialogFile(null)} labelledBy="diff-dialog-title">
        <ModalHeading
          eyebrow="Diff"
          title={diffDialogFile?.path ?? ""}
          titleId="diff-dialog-title"
          onClose={() => setDiffDialogFile(null)}
          t={t}
        />
        <section className="diff-panel diff-dialog-body">
          {diffDialogFile ? (
            <div className="panel-title-row">
              <div className="diff-panel-heading">
                <ChangeBadge status={diffDialogFile.changeType as any} t={t} />
                <strong title={diffDialogFile.path}>{diffDialogFile.path}</strong>
              </div>
            </div>
          ) : null}
          <DiffCodeBlock content={diffDialogFile?.diff ?? ""} path={diffDialogFile?.path} />
        </section>
      </Modal>
    </>
  );
}

function renderDiffLines(diff: string) {
  return diff.split("\n").map((line, i) => {
    let cls = "";
    const first = line.charAt(0);
    if (first === "+" && !line.startsWith("+++")) cls = "diff-add";
    else if (first === "-" && !line.startsWith("---")) cls = "diff-del";
    else if (line.startsWith("@@")) cls = "diff-hunk";
    else if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ") || line.startsWith("new file") || line.startsWith("deleted file") || line.startsWith("rename ")) cls = "diff-meta";
    return <span key={i} className={cls}>{line}{"\n"}</span>;
  });
}

function parsePerFileDiffs(diff: string): { path: string; changeType: string; diff: string }[] {
  // Git format: sections start with "diff --git a/path b/path"
  if (diff.includes("diff --git")) {
    const sections = diff.split(/(?=^diff --git )/m).filter((s) => s.includes("diff --git"));
    return sections.map((section) => {
      const headerMatch = section.match(/^diff --git a\/(.+) b\/(.+)$/m);
      const path = headerMatch?.[2]?.trim() ?? "";
      let changeType = "modified";
      if (section.includes("new file mode")) changeType = "added";
      else if (section.includes("deleted file mode")) changeType = "deleted";
      else if (section.includes("rename from")) changeType = "renamed";
      return { path, changeType, diff: section };
    });
  }
  // SVN format: sections start with "Index: path"
  if (diff.includes("Index: ")) {
    const sections = diff.split(/(?=^Index: )/m).filter((s) => s.includes("Index: "));
    return sections.map((section) => {
      const match = section.match(/^Index: (.+)$/m);
      const path = match?.[1]?.trim() ?? "";
      let changeType = "modified";
      if (section.includes("(added)")) changeType = "added";
      else if (section.includes("(deleted)")) changeType = "deleted";
      return { path, changeType, diff: section };
    });
  }
  return [];
}

function formatLogDate(dateStr: string) {
  try { return new Date(dateStr).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return dateStr; }
}
