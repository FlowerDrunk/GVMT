import { useCallback, useEffect, useRef, useState } from "react";
import type { CommitDetail, GitCommitLog, GitStashEntry, OperationResult, Repository } from "../../lib/api";
import { gitFetch, gitLog, gitShowDetail, gitStashDrop, gitStashList, gitStashPop, gitStashPush, svnCleanup, svnLog, svnShowDetail } from "../../lib/api";
import { getVcsLabels } from "../../lib/constants";
import type { Translator } from "../../lib/i18n";
import { Modal, ModalHeading } from "../shared/Modal";

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

function RefreshIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>; }
function CommitIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/></svg>; }
function IgnoreIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>; }
function FetchIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>; }
function StashIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M4 12l8 8 8-8"/></svg>; }
function LogIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>; }
function UpdateIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.5 15a9 9 0 1 1-2.3-9.8"/></svg>; }
function CleanIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>; }
function SettingsIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>; }
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
  const [isCleaningUp, setIsCleaningUp] = useState(false);

  // ── Log detail & context menu state ──
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, CommitDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [logMenu, setLogMenu] = useState<{ x: number; y: number; entry: GitCommitLog } | null>(null);
  const repoId = selectedRepository?.id;

  const closeLogMenu = useCallback(() => setLogMenu(null), []);
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
        {selectedRepository ? <span className="soft-chip">{getVcsLabels(t)[selectedRepository.vcsType]}</span> : null}
        {(() => {
          const rev = selectedRepository
            ? (latestSvnRevisions[selectedRepository.id] ?? selectedRepository.branchOrRevision)
            : null;
          return rev ? (
            <button className="command-branch" type="button" onClick={onSwitchBranch}>{rev}</button>
          ) : null;
        })()}
        <span className="command-sep" />
        <div className="command-metrics">
          <span>{t("command.changes")} <strong>{currentChangeCount}</strong></span>
          <span>{currentReviewState}</span>
        </div>
      </div>

      <div className="command-actions">
        {isGitRepo ? (<>
          <span className="cmd-sep" />

          {/* ── Fetch ── */}
          <button className="cmd-btn" type="button" disabled={!selectedRepository || isFetching}
            onClick={handleGitFetch} title={t("command.fetch")}>
            <FetchIcon /><span>{t("command.fetch")}</span>
          </button>

          {/* ── Stash ── */}
          <div className="cmd-stash-wrap" ref={stashMenuRef}>
            <button className="cmd-btn" type="button" disabled={!selectedRepository}
              onClick={() => setIsStashMenuOpen(!isStashMenuOpen)} title={t("command.stash")}>
              <StashIcon /><span>{t("command.stash")}</span><ChevronDown />
            </button>
            {isStashMenuOpen ? (
              <div className="stash-menu-dropdown">
                <button type="button" onClick={handleStashPush}><StashIcon /><span>{t("command.stashPush")}</span></button>
                <button type="button" onClick={handleStashPop}><StashIcon /><span>{t("command.stashPop")}</span></button>
                <div className="stash-menu-divider" />
                <div className="stash-menu-label">{t("command.stash")}</div>
                {stashEntries.length === 0 ? (
                  <div className="stash-menu-empty">{t("command.stashEmpty")}</div>
                ) : (
                  stashEntries.slice(0, 5).map((entry) => (
                    <div className="stash-menu-item" key={entry.index}>
                      <span className="stash-menu-msg">{entry.message.length > 30 ? entry.message.slice(0, 30) + "…" : entry.message}</span>
                      <button className="stash-menu-drop-btn cmd-danger" type="button" onClick={() => handleStashDrop(entry.index)} title={t("command.stashDrop")}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>

          {/* ── Log ── */}
          <button className="cmd-btn" type="button" disabled={!selectedRepository}
            onClick={handleOpenGitLog} title={t("command.log")}>
            <LogIcon /><span>{t("command.log")}</span>
          </button>
        </>) : null}

        {isSvnRepo ? (<>
          <span className="cmd-sep" />

          {/* ── Cleanup ── */}
          <button className="cmd-btn" type="button" disabled={!selectedRepository || isCleaningUp}
            onClick={handleSvnCleanup} title={t("command.cleanup")}>
            <CleanIcon /><span>{t("command.cleanup")}</span>
          </button>

          {/* ── Force Update ── */}
          <button className="cmd-btn" type="button" disabled={!selectedRepository || isLoading}
            onClick={onForceUpdateRepository} title={t("contextMenu.forceUpdate")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.5 15a9 9 0 1 1-2.3-9.8"/></svg><span>{t("contextMenu.forceUpdate")}</span>
          </button>

          {/* ── Log ── */}
          <button className="cmd-btn" type="button" disabled={!selectedRepository}
            onClick={handleOpenSvnLog} title={t("command.log")}>
            <LogIcon /><span>{t("command.log")}</span>
          </button>
        </>) : null}

        {/* ── 右侧重要操作组 ── */}
        <span className="cmd-group-sep" />

        {/* 检测 */}
        <button className="cmd-btn cmd-refresh-btn" type="button" disabled={!selectedRepository || isLoading}
          onClick={onLoadRepositoryStatus} title={t("command.refreshStatus")}>
          <RefreshIcon /><span>{t("command.refreshStatus")}</span>
        </button>

        {/* 忽略 */}
        <button className="cmd-btn cmd-ignore-btn" type="button" disabled={!selectedRepository || isIgnoreLoading}
          onClick={onOpenIgnoreDialog} title={t("command.ignore")}>
          <IgnoreIcon /><span>{t("command.ignore")}</span>
        </button>

        {/* 更新 */}
        <button className="cmd-btn cmd-update-btn" type="button" disabled={!selectedRepository || isLoading}
          onClick={onUpdateRepository} title={t("command.update")}>
          <UpdateIcon /><span>{t("command.update")}</span>
        </button>

        {/* 提交 */}
        <button className="cmd-btn cmd-commit-btn" type="button" disabled={!canOpenCommitDialog || isCommitLoading}
          onClick={onOpenCommitDialog} title={t("command.commit")}>
          <CommitIcon /><span>{t("command.commit")}</span>
        </button>

        {/* 设置（仅图标） */}
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
                          {detail.files.length > 0 ? (
                            <div className="git-log-files">
                              <span className="git-log-files-label">{t("general.changedFiles", { count: detail.files.length })}</span>
                              <div className="git-log-files-list">
                                {detail.files.map((f, fi) => (
                                  <span key={fi} className={`change-badge ${f.changeType}`}>{f.path}</span>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {detail.diff ? (
                            <pre className="git-log-diff"><code>{detail.diff}</code></pre>
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

function formatLogDate(dateStr: string) {
  try { return new Date(dateStr).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return dateStr; }
}
