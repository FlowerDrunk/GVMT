import { useEffect, useState } from "react";
import type { GitCommitLog, Repository } from "../../lib/api";
import { gitLog, svnLog } from "../../lib/api";
import type { Translator } from "../../lib/i18n";
import { VcsLabels } from "../../lib/constants";
import { emptyStateCopy, formatRemoteUrlForDisplay, statusTone, vcsDescriptions } from "../../lib/utils";

interface RepositorySummaryPanelProps {
  selectedRepository: Repository | undefined;
  currentReviewState: string;
  currentChangeCount: number;
  t: Translator;
  onLatestSvnRevision?: (repoId: number, revision: string) => void;
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

  // 显示版本号：优先使用从 svn log 获取的最新版本
  const displayRevision = latestSvnRevision ?? selectedRepository?.branchOrRevision ?? null;

  function updateRevision(revision: string) {
    setLatestSvnRevision(revision);
    if (selectedRepository && onLatestSvnRevision) {
      onLatestSvnRevision(selectedRepository.id, revision);
    }
  }

  // 加载提交历史
  useEffect(() => {
    if (!selectedRepository || !showLog) return;
    setIsLogLoading(true);
    setGitLogs([]);

    const load = async () => {
      const id = selectedRepository.id;
      if (isGitRepo) {
        try {
          const logs = await gitLog(id, 10);
          setGitLogs(logs);
        } catch { /* ignore */ }
      }
      if (isSvnRepo) {
        try {
          const logs = await svnLog(id, 10);
          const mapped = logs.map((l) => ({ hash: `r${l.revision}`, author: l.author, date: l.date, message: l.message }));
          setGitLogs(mapped);
          if (logs.length > 0) {
            updateRevision(`r${logs[0].revision}`);
          }
        } catch { /* ignore */ }
      }
      setIsLogLoading(false);
    };
    load();
  }, [selectedRepository?.id, showLog, isGitRepo, isSvnRepo]);

  // 未展开提交历史时也后台获取 SVN 最新版本号
  useEffect(() => {
    if (!selectedRepository || !isSvnRepo || showLog) return;
    let cancelled = false;
    svnLog(selectedRepository.id, 1).then((logs) => {
      if (!cancelled && logs.length > 0) {
        updateRevision(`r${logs[0].revision}`);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedRepository?.id]);

  return (
    <section className="panel repository-summary-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Repository info</p>
          <h3>{t("review.repoInfo")}</h3>
        </div>
        <span className={`status-pill ${selectedRepository ? statusTone(selectedRepository.vcsType) : "warning"}`}>
          {selectedRepository ? VcsLabels[selectedRepository.vcsType] : t("review.notSelected")}
        </span>
      </div>
      {selectedRepository ? (
        <div className="repository-summary-body">
          <div className="summary-topline">
            <span className="soft-chip">{currentReviewState}</span>
            <span className="command-metrics">
              <span>{t("command.changes")} <strong>{currentChangeCount}</strong></span>
            </span>
          </div>
          <dl className="metadata">
            <div>
              <dt>名称</dt>
              <dd><strong>{selectedRepository.name}</strong></dd>
            </div>
            <div>
              <dt>{t("review.path")}</dt>
              <dd>{selectedRepository.path}</dd>
            </div>
            <div>
              <dt>{t("review.remote")}</dt>
              <dd className="remote-url-value" title={formatRemoteUrlForDisplay(selectedRepository.remoteUrl)}>
                <span className="remote-url-text">{formatRemoteUrlForDisplay(selectedRepository.remoteUrl)}</span>
                <CopyButton value={selectedRepository.remoteUrl ?? ""} />
              </dd>
            </div>
            <div>
              <dt>{t("review.branch")}</dt>
              <dd>{displayRevision ?? t("review.notDetected")}</dd>
            </div>
          </dl>
          <p className="repository-summary-desc">{vcsDescriptions[selectedRepository.vcsType]}</p>

          {/* 提交历史 */}
          <div className="repo-log-section">
            <button
              className="repo-log-toggle"
              type="button"
              onClick={() => setShowLog(!showLog)}
            >
              {showLog ? "收起" : "展开"}最近提交 {isLogLoading ? "…" : `(${gitLogs.length})`}
            </button>
            {showLog ? (
              <div className="repo-log-list">
                {isLogLoading ? (
                  <p className="repo-log-loading">加载中...</p>
                ) : gitLogs.length === 0 ? (
                  <p className="repo-log-empty">暂无提交记录</p>
                ) : (
                  gitLogs.map((entry, idx) => (
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
                  ))
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="review-empty">
          <h3>{emptyStateCopy.title}</h3>
          <p>{emptyStateCopy.body}</p>
        </div>
      )}
    </section>
  );
}

function formatDate(dateStr: string) {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return dateStr;
  }
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  return (
    <button type="button" className="remote-url-copy" onClick={handleCopy} title="复制地址">
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}
