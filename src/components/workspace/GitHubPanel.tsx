import { useEffect, useState } from "react";
import type { Repository, GhRepoInfo, GitHubPr, GitHubRun } from "../../lib/api";
import { getGhRepoInfo, ghListPrs, ghListActions, ghOpenBrowser } from "../../lib/api";
import type { Translator } from "../../lib/i18n";
import { Button } from "../ui/button";

interface GitHubPanelProps {
  selectedRepository: Repository | undefined;
  t: Translator;
}

type LoadingState = "idle" | "loading" | "loaded" | "error";

export function GitHubPanel({ selectedRepository, t }: GitHubPanelProps) {
  const [repoInfo, setRepoInfo] = useState<GhRepoInfo | null>(null);
  const [prs, setPrs] = useState<GitHubPr[]>([]);
  const [runs, setRuns] = useState<GitHubRun[]>([]);
  const [infoState, setInfoState] = useState<LoadingState>("idle");
  const [prState, setPrState] = useState<LoadingState>("idle");
  const [runState, setRunState] = useState<LoadingState>("idle");
  const [infoError, setInfoError] = useState<string | null>(null);

  const remoteUrl = selectedRepository?.remoteUrl;
  const isSvn = selectedRepository?.vcsType === "svn";

  useEffect(() => {
    setRepoInfo(null);
    setPrs([]);
    setRuns([]);
    setInfoState("idle");
    setPrState("idle");
    setRunState("idle");
    setInfoError(null);

    // gh CLI only works with Git repositories, skip SVN
    if (!remoteUrl || isSvn) return;

    setInfoState("loading");
    getGhRepoInfo(remoteUrl)
      .then((info) => {
        setRepoInfo(info);
        setInfoState("loaded");
      })
      .catch((err) => {
        setInfoError(err instanceof Error ? err.message : String(err));
        setInfoState("error");
      });

    setPrState("loading");
    ghListPrs(remoteUrl)
      .then((result) => {
        setPrs(result.prs);
        setPrState("loaded");
      })
      .catch(() => setPrState("error"));

    setRunState("loading");
    ghListActions(remoteUrl)
      .then((result) => {
        setRuns(result.runs);
        setRunState("loaded");
      })
      .catch(() => setRunState("error"));
  }, [remoteUrl, isSvn]);

  if (!remoteUrl || isSvn) return null;

  return (
    <section className="context-section github-section">
      <div className="section-kicker">GitHub</div>

      {infoState === "loading" ? (
        <p className="github-loading">加载中...</p>
      ) : infoState === "error" ? (
        <div className="github-empty">
          <p>{infoError || "无法获取仓库信息"}</p>
        </div>
      ) : repoInfo ? (
        <>
          <div className="github-repo-header">
            <h4>{repoInfo.owner}/{repoInfo.name}</h4>
            <span className={`github-visibility ${repoInfo.isPrivate ? "private" : "public"}`}>
              {repoInfo.isPrivate ? "Private" : "Public"}
            </span>
          </div>
          {repoInfo.description ? <p className="github-desc">{repoInfo.description}</p> : null}
          <dl className="metadata compact">
            {repoInfo.primaryLanguage ? (
              <div>
                <dt>主要语言</dt>
                <dd>{repoInfo.primaryLanguage}</dd>
              </div>
            ) : null}
            <div>
              <dt>默认分支</dt>
              <dd>{repoInfo.defaultBranch}</dd>
            </div>
          </dl>
          <div className="github-actions-row">
            <Button variant="secondary" onClick={() => ghOpenBrowser(remoteUrl, "repo")}>
              在浏览器中打开
            </Button>
            <Button variant="secondary" onClick={() => ghOpenBrowser(remoteUrl, "prs")}>
              PR ({prState === "loaded" ? prs.length : "…"})
            </Button>
            <Button variant="secondary" onClick={() => ghOpenBrowser(remoteUrl, "actions")}>
              Actions
            </Button>
          </div>
        </>
      ) : null}

      {prState === "loading" ? (
        <p className="github-loading">加载 PR 列表...</p>
      ) : prState === "loaded" && prs.length > 0 ? (
        <div className="github-pr-list">
          <div className="section-kicker github-list-title">Pull Requests</div>
          {prs.slice(0, 5).map((pr) => (
            <div className="github-pr-item" key={pr.number}>
              <span className={`github-pr-state ${pr.state}`}>
                {pr.state === "open" ? "🟢" : "🔒"}
              </span>
              <strong>{pr.title}</strong>
              <small>#{pr.number}</small>
            </div>
          ))}
        </div>
      ) : prState === "loaded" ? (
        <p className="github-muted">暂无 Pull Requests</p>
      ) : null}

      {runState === "loaded" && runs.length > 0 ? (
        <div className="github-run-list">
          <div className="section-kicker github-list-title">Actions</div>
          {runs.slice(0, 3).map((run, idx) => (
            <div className="github-run-item" key={idx}>
              <span className={`github-run-status ${run.conclusion ?? "pending"}`}>
                {run.conclusion === "success" ? "✅" : run.conclusion === "failure" ? "❌" : "⏳"}
              </span>
              <span>{run.name}</span>
              <small>{run.headBranch}</small>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
