import { useEffect, useState } from "react";
import type { GitCommitLog, Repository } from "../../lib/api";
import { gitLog, svnLog } from "../../lib/api";
import type { Translator } from "../../lib/i18n";
import { getVcsLabels } from "../../lib/constants";
import { getEmptyStateCopy, formatRemoteUrlForDisplay, getVcsDescriptions, statusTone } from "../../lib/utils";

interface RepositorySummaryPanelProps {
  selectedRepository: Repository | undefined;
  currentReviewState: string;
  currentChangeCount: number;
  t: Translator;
  onLatestSvnRevision?: (repoId: number, revision: string) => void;
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="meta-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function RepositorySummaryPanel({
  selectedRepository,
  currentReviewState,
  currentChangeCount,
  t,
  onLatestSvnRevision,
}: RepositorySummaryPanelProps) {
  const [gitLogs, setGitLogs] = useState<GitCommitLog[]>([]);
  const [isLogLoading, setIsLogLoading] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [latestSvnRevision, setLatestSvnRevision] = useState<string | null>(null);

  const isGitRepo = selectedRepository?.vcsType === "git" || selectedRepository?.vcsType === "mixed";
  const isSvnRepo = selectedRepository?.vcsType === "svn" || selectedRepository?.vcsType === "mixed";
  const displayRevision = latestSvnRevision ?? selectedRepository?.branchOrRevision ?? null;

  function updateRevision(revision: string) {
    setLatestSvnRevision(revision);
    if (selectedRepository && onLatestSvnRevision) onLatestSvnRevision(selectedRepository.id, revision);
  }

  useEffect(() => {
    if (!selectedRepository || !showLog) return;
    setIsLogLoading(true); setGitLogs([]);
    const load = async () => {
      const id = selectedRepository.id;
      if (isGitRepo) try { setGitLogs(await gitLog(id, 10)); } catch { /* ignore */ }
      if (isSvnRepo) try {
        const logs = await svnLog(id, 10);
        setGitLogs(logs.map((l) => ({ hash: `r${l.revision}`, author: l.author, date: l.date, message: l.message })));
        if (logs.length > 0) updateRevision(`r${logs[0].revision}`);
      } catch { /* ignore */ }
      setIsLogLoading(false);
    };
    load();
  }, [selectedRepository?.id, showLog, isGitRepo, isSvnRepo]);

  useEffect(() => {
    if (!selectedRepository || !isSvnRepo || showLog) return;
    let cancelled = false;
    svnLog(selectedRepository.id, 1).then((logs) => { if (!cancelled && logs.length > 0) updateRevision(`r${logs[0].revision}`); }).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedRepository?.id]);

  return (
    <section className="panel repository-summary-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Repository info</p>
          <h3>{selectedRepository?.name ?? t("review.repoInfo")}</h3>
        </div>
        <span className={`status-pill ${selectedRepository ? statusTone(selectedRepository.vcsType) : "warning"}`}>
          {selectedRepository ? getVcsLabels(t)[selectedRepository.vcsType] : t("review.notSelected")}
        </span>
      </div>
      {selectedRepository ? (
        <div className="repository-summary-body">
          <dl className="metadata metadata-grid">
            <MetaRow label={t("review.path")}>
              <span className="meta-path">{selectedRepository.path}</span>
            </MetaRow>
            <MetaRow label={t("review.remote")}>
              <span className="remote-url-value" title={formatRemoteUrlForDisplay(selectedRepository.remoteUrl, t("repo.notDetected"))}>
                <span className="remote-url-text">{formatRemoteUrlForDisplay(selectedRepository.remoteUrl, t("repo.notDetected"))}</span>
                <CopyButton value={selectedRepository.remoteUrl ?? ""} title={t("ui.copyAddress")} />
              </span>
            </MetaRow>
            <MetaRow label={t("review.branch")}>
              <span className="meta-branch">{displayRevision ?? t("review.notDetected")}</span>
              <span className="meta-changes">{currentChangeCount} {t("command.changes")}</span>
            </MetaRow>
          </dl>

          {selectedRepository.notes ? (
            <div className="repo-notes">
              <span className="repo-notes-label">{t("summary.notes")}</span>
              <p>{selectedRepository.notes}</p>
            </div>
          ) : null}

          <div className="repo-log-section">
            <button className="repo-log-toggle" type="button" onClick={() => setShowLog(!showLog)}>
              <svg className="repo-log-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: showLog ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 150ms ease" }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
              {t("summary.recentCommits")} {isLogLoading ? "…" : gitLogs.length}
            </button>
            {showLog ? (
              <div className="repo-log-list">
                {isLogLoading ? <p className="repo-log-loading">{t("summary.loading")}</p>
                : gitLogs.length === 0 ? <p className="repo-log-empty">{t("summary.noCommits")}</p>
                : gitLogs.map((entry, idx) => (
                    <div className="repo-log-item" key={idx}>
                      <code className="repo-log-hash">{entry.hash}</code>
                      <div className="repo-log-main">
                        <strong className="repo-log-msg">{entry.message}</strong>
                        <div className="repo-log-meta">
                          <span>{entry.author}</span>
                          <time>{formatDate(entry.date)}</time>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="review-empty">
          <h3>{getEmptyStateCopy(t).title}</h3>
          <p>{getEmptyStateCopy(t).body}</p>
        </div>
      )}
    </section>
  );
}

function formatDate(dateStr: string) {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return dateStr; }
}

function CopyButton({ value, title }: { value: string; title: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  }
  return (
    <button type="button" className="remote-url-copy" onClick={handleCopy} title={title}>
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      )}
    </button>
  );
}
