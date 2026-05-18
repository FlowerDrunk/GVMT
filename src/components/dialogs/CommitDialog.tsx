import { FormEvent, useMemo, useRef, useState } from "react";
import type { ChangeItem, QualityCheckResult, VcsType } from "../../lib/api";
import type { Translator } from "../../lib/i18n";
import { changeKey } from "../../lib/constants";
import { Modal, ModalHeading } from "../shared/Modal";
import { Switch } from "../ui/switch";
import { ChangeBadge } from "../shared/ChangeBadge";
import { Button } from "../ui/button";

const RECENT_MESSAGES_KEY = "gvmt-recent-commit-messages";
const MAX_RECENT = 5;
function loadRecentMessages(): string[] {
  try { const raw = localStorage.getItem(RECENT_MESSAGES_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function saveRecentMessage(msg: string) {
  const msgs = loadRecentMessages().filter((m) => m !== msg);
  msgs.unshift(msg);
  localStorage.setItem(RECENT_MESSAGES_KEY, JSON.stringify(msgs.slice(0, MAX_RECENT)));
}

interface CommitDialogProps {
  open: boolean; onClose: () => void; t: Translator;
  committableFiles: ChangeItem[]; selectedCommitKeys: Set<string>; selectedCommitCount: number;
  hasGitCommitSelection: boolean; pushAfterCommit: boolean; commitMessage: string; isCommitLoading: boolean;
  latestQualityResult: QualityCheckResult | null; vcsLabels: Record<VcsType, string>;
  commitError: string | null; commitHash: string | null;
  onToggleAllFiles: (files: ChangeItem[]) => void; onToggleFile: (change: ChangeItem) => void;
  onPushToggle: (push: boolean) => void; onCommitMessageChange: (message: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onOpenFileDiff: (path: string, vcsType: VcsType, status: string) => void;
}

interface FileGroup { label: string; status: string; files: ChangeItem[]; }
const GROUP_ORDER = ["added", "modified", "deleted", "untracked", "renamed"];

function getGroupLabels(t: Translator): Record<string, string> {
  return {
    added: t("change.added"),
    modified: t("change.modified"),
    deleted: t("change.deleted"),
    untracked: t("change.untracked"),
    renamed: t("change.renamed"),
  };
}

type StatusFilter = "all" | "added" | "modified" | "deleted" | "untracked" | "renamed";
type PathFilter = "all" | "file" | "folder";

function getStatusFilters(t: Translator): { key: StatusFilter; label: string }[] {
  return [
    { key: "all", label: t("ui.all") },
    { key: "added", label: t("change.added") },
    { key: "modified", label: t("change.modified") },
    { key: "deleted", label: t("change.deleted") },
    { key: "untracked", label: t("change.untracked") },
  ];
}

function getPathFilters(t: Translator): { key: PathFilter; label: string }[] {
  return [
    { key: "all", label: t("ui.all") },
    { key: "file", label: t("ui.file") },
    { key: "folder", label: t("ui.folderFilter") },
  ];
}

export function CommitDialog({
  open, onClose, t, committableFiles, selectedCommitKeys, selectedCommitCount,
  hasGitCommitSelection, pushAfterCommit, commitMessage, isCommitLoading,
  latestQualityResult, vcsLabels, commitError, commitHash,
  onToggleAllFiles, onToggleFile, onPushToggle, onCommitMessageChange, onSubmit, onOpenFileDiff,
}: CommitDialogProps) {
  const titleId = "commit-dialog-title";
  const [searchQuery, setSearchQuery] = useState("");
  const [showRecent, setShowRecent] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [pathFilter, setPathFilter] = useState<PathFilter>("all");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recentMessages = useMemo(loadRecentMessages, [open]);
  const [browseGroup, setBrowseGroup] = useState<FileGroup | null>(null);
  const [browseQuery, setBrowseQuery] = useState("");

  const groupLabels = useMemo(() => getGroupLabels(t), [t]);
  const statusFilters = useMemo(() => getStatusFilters(t), [t]);
  const pathFilters = useMemo(() => getPathFilters(t), [t]);

  const showPathFilter = useMemo(() => committableFiles.some((f) => f.path.includes("/")), [committableFiles]);

  const filteredFiles = useMemo(() => {
    let files = committableFiles;
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); files = files.filter((f) => f.path.toLowerCase().includes(q)); }
    if (statusFilter !== "all") files = files.filter((f) => f.status === statusFilter);
    if (pathFilter === "file") files = files.filter((f) => !f.path.includes("/"));
    else if (pathFilter === "folder") files = files.filter((f) => f.path.includes("/"));
    return files;
  }, [committableFiles, searchQuery, statusFilter, pathFilter]);

  const groups = useMemo(() => {
    const grouped: FileGroup[] = [];
    for (const status of GROUP_ORDER) {
      const files = filteredFiles.filter((f) => f.status === status);
      if (files.length > 0) grouped.push({ label: groupLabels[status] || status, status, files });
    }
    const other = filteredFiles.filter((f) => !GROUP_ORDER.includes(f.status));
    if (other.length > 0) grouped.push({ label: t("commit.fileGroupOther"), status: "other", files: other });
    return grouped;
  }, [filteredFiles, groupLabels, t]);

  const totalFileCount = committableFiles.length;

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: committableFiles.length };
    for (const status of GROUP_ORDER) counts[status] = committableFiles.filter((f) => f.status === status).length;
    return counts;
  }, [committableFiles]);

  const vcsTypes = useMemo(() => {
    const types = new Set(committableFiles.map((f) => f.vcsType));
    return { hasGit: types.has("git") || types.has("mixed"), hasSvn: types.has("svn"), isSingle: types.size <= 1 };
  }, [committableFiles]);

  const browseFilteredFiles = useMemo(() => {
    if (!browseGroup) return [];
    if (!browseQuery.trim()) return browseGroup.files;
    const q = browseQuery.toLowerCase();
    return browseGroup.files.filter((f) => f.path.toLowerCase().includes(q));
  }, [browseGroup, browseQuery]);

  function handleKeyDown(event: React.KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !isCommitLoading && selectedCommitCount > 0 && commitMessage.trim()) {
      event.preventDefault();
      const form = (event.target as HTMLElement).closest("form");
      if (form) form.requestSubmit();
    }
  }
  function selectRecentMessage(msg: string) { onCommitMessageChange(msg); setShowRecent(false); }
  function toggleGroupCollapse(status: string) {
    setCollapsedGroups((prev) => { const next = new Set(prev); if (next.has(status)) next.delete(status); else next.add(status); return next; });
  }

  const svnUntrackedCount = useMemo(() => committableFiles.filter((f) => f.vcsType === "svn" && f.status === "untracked").length, [committableFiles]);

  const submitLabel = useMemo(() => {
    if (isCommitLoading) return t("commit.submitting");
    const parts: string[] = [];
    const gitCount = committableFiles.filter((f) => selectedCommitKeys.has(changeKey(f)) && (f.vcsType === "git" || f.vcsType === "mixed")).length;
    const svnCount = committableFiles.filter((f) => selectedCommitKeys.has(changeKey(f)) && f.vcsType === "svn").length;
    if (gitCount > 0) parts.push(`Git(${gitCount})`);
    if (svnCount > 0) parts.push(`SVN(${svnCount})`);
    return parts.length > 0 ? `${t("command.commit")} ${parts.join(" + ")}` : t("commit.submit");
  }, [isCommitLoading, committableFiles, selectedCommitKeys, t]);

  const isSearching = searchQuery.trim().length > 0 || statusFilter !== "all" || pathFilter !== "all";

  function renderFileRow(change: ChangeItem, showCheckbox = true) {
    const key = changeKey(change);
    return (
      <label className="commit-file-row" key={key}>
        {showCheckbox ? <input type="checkbox" checked={selectedCommitKeys.has(key)} onChange={() => onToggleFile(change)} /> : <span className="commit-row-spacer" />}
        <ChangeBadge status={change.status} t={t} />
        <strong>{change.path}</strong>
        <small>{vcsLabels[change.vcsType]}</small>
        <button type="button" className="commit-file-view" title={t("commit.viewDiff")} onClick={(e) => { e.preventDefault(); onOpenFileDiff(change.path, change.vcsType, change.status); }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
      </label>
    );
  }

  function openBrowse(group: FileGroup) {
    setBrowseGroup(group);
    setBrowseQuery("");
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy={titleId} className="commit-dialog">
      <form onSubmit={onSubmit} style={{ display: "contents" }}>
      <ModalHeading eyebrow="Commit changes" title={t("commit.title")} titleId={titleId} onClose={onClose} t={t} />

      <div className="commit-fixed-top">
        <div className="commit-dialog-summary">
          <div><span>{t("commit.selectedFiles")}</span><strong>{selectedCommitCount}</strong></div>
          <div><span>{t("commit.committable")}</span><strong>{totalFileCount}</strong></div>
          <div><span>{t("commit.pushLabel")}</span><strong>{hasGitCommitSelection && pushAfterCommit ? t("commit.onLabel") : t("commit.offLabel")}</strong></div>
          {commitHash ? <div className="commit-hash-badge"><code>{commitHash.slice(0, 12)}</code></div> : null}
        </div>
        <div className="commit-quality-summary" data-state={latestQualityResult?.status ?? "idle"}>
          <span>{t("commit.qualityCheckLabel")}</span>
          {latestQualityResult ? <><strong>{latestQualityResult.summary}</strong><small>{latestQualityResult.label}</small></>
            : <><strong>{t("commit.notRun")}</strong><small>{t("commit.notRunDesc")}</small></>}
        </div>

        <input className="commit-search-input" type="text" placeholder={t("commit.searchFiles")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />

        <div className="commit-filter-bar">
          <div className="commit-filter-group">
            {statusFilters.map((f) => (
              <button key={f.key} type="button" className={`commit-filter-chip ${statusFilter === f.key ? "active" : ""}`} onClick={() => setStatusFilter(f.key)}>
                {f.label}{f.key !== "all" && statusCounts[f.key] > 0 ? <span className="commit-filter-count">{statusCounts[f.key]}</span> : null}
              </button>
            ))}
          </div>
          {showPathFilter ? (
            <div className="commit-filter-group">
              {pathFilters.map((f) => (
                <button key={f.key} type="button" className={`commit-filter-chip ${pathFilter === f.key ? "active" : ""}`} onClick={() => setPathFilter(f.key)}>{f.label}</button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="commit-toolbar-actions">
          <span className="commit-toolbar-label">{t("ui.selectAll")}</span>
          <Button variant="ghost" size="sm" type="button" onClick={() => onToggleAllFiles(filteredFiles)}>{t("commit.currentView")}</Button>
          <Button variant="ghost" size="sm" type="button" onClick={() => onToggleAllFiles(committableFiles)}>{t("commit.allFiles")}</Button>
          {!vcsTypes.isSingle && vcsTypes.hasGit ? <Button variant="ghost" size="sm" type="button" onClick={() => onToggleAllFiles(committableFiles.filter((f) => f.vcsType === "git" || f.vcsType === "mixed"))}>Git</Button> : null}
          {!vcsTypes.isSingle && vcsTypes.hasSvn ? <Button variant="ghost" size="sm" type="button" onClick={() => onToggleAllFiles(committableFiles.filter((f) => f.vcsType === "svn"))}>SVN</Button> : null}
          {hasGitCommitSelection ? (
            <label className="radix-switch-label commit-push-toggle"><Switch checked={pushAfterCommit} onCheckedChange={onPushToggle} /><span>push</span></label>
          ) : null}
        </div>
      </div>

      <div className="commit-scroll-area">
        {groups.length === 0 && isSearching ? <div className="commit-file-empty">{t("ui.noMatch")}</div> : null}
        {groups.map((group) => {
          const groupAllSelected = group.files.every((f) => selectedCommitKeys.has(changeKey(f)));
          const isCollapsed = collapsedGroups.has(group.status);
          return (
            <div className="commit-file-group" key={`group-${group.status}`}>
              <div className="commit-file-group-header">
                <button type="button" className="commit-file-group-collapse" onClick={() => toggleGroupCollapse(group.status)}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 120ms ease" }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <span className="commit-file-group-label">{group.label}</span>
                <span className="commit-file-group-count">{group.files.length}</span>
                <button type="button" className="commit-file-group-browse" title={t("commit.browseGroup")} onClick={() => openBrowse(group)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                </button>
                <button type="button" className="commit-file-group-select" onClick={() => onToggleAllFiles(group.files)}>
                  {groupAllSelected ? t("ui.deselectAll") : t("ui.selectAll")}
                </button>
              </div>
              {!isCollapsed ? group.files.map((f) => renderFileRow(f)) : null}
            </div>
          );
        })}
      </div>

      <div className="commit-fixed-bottom">
        {svnUntrackedCount > 0 ? <div className="commit-svn-hint">{t("commit.svnUntrackedHint", { count: svnUntrackedCount })}</div> : null}

        <div className="commit-message-field">
          <div className="commit-message-header">
            <span>{t("commit.messageLabel")}</span>
            {recentMessages.length > 0 ? <button type="button" className="commit-recent-btn" onClick={() => setShowRecent(!showRecent)}>{t("commit.recentMessages")}</button> : null}
          </div>
          {showRecent && recentMessages.length > 0 ? (
            <div className="commit-recent-list">
              {recentMessages.map((msg, i) => (
                <span key={i} className="commit-recent-item" onClick={() => selectRecentMessage(msg)}>{msg.length > 60 ? msg.slice(0, 60) + "…" : msg}</span>
              ))}
            </div>
          ) : null}
          <textarea value={commitMessage} onChange={(e) => onCommitMessageChange(e.target.value)} placeholder={t("commit.placeholder")} rows={3} />
        </div>

        {commitError ? <div className="commit-error">{commitError}</div> : null}

        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose} type="button">{t("commit.cancel")}</Button>
          <Button variant="default" type="submit" disabled={isCommitLoading || selectedCommitCount === 0 || !commitMessage.trim()}>{submitLabel}</Button>
        </div>
      </div>

      <Modal open={browseGroup !== null} onClose={() => setBrowseGroup(null)} labelledBy="browse-group-modal">
        <ModalHeading eyebrow={browseGroup?.label ?? ""} title={`${browseGroup?.label ?? ""} (${browseGroup?.files.length ?? 0})`} titleId="browse-group-modal" onClose={() => setBrowseGroup(null)} t={t} />
        {browseGroup ? (
          <div className="browse-modal-body">
            <div className="browse-modal-toolbar">
              <input className="browse-modal-search" type="text" placeholder={t("ui.search")} value={browseQuery} onChange={(e) => setBrowseQuery(e.target.value)} />
              <Button variant="ghost" size="sm" type="button" onClick={() => onToggleAllFiles(browseFilteredFiles)}>
                {browseFilteredFiles.every((f) => selectedCommitKeys.has(changeKey(f))) ? t("ui.deselectAll") : t("ui.selectAll")}
              </Button>
            </div>
            <div className="browse-modal-list">
              {browseFilteredFiles.length === 0 && browseQuery.trim() ? <div className="browse-modal-empty">{t("ui.noMatch")}</div>
              : browseFilteredFiles.map((f) => renderFileRow(f))}
            </div>
          </div>
        ) : null}
      </Modal>
    </form>
    </Modal>
  );
}
