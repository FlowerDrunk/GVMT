import { useEffect, useState } from "react";
import type { Repository, GhRepoInfo, GitHubPr, GitHubRun } from "../../lib/api";
import { getGhRepoInfo, ghListPrs, ghListActions, ghOpenBrowser, createPr } from "../../lib/api";
import type { Translator } from "../../lib/i18n";
import { Button } from "../ui/button";
import { Modal, ModalHeading } from "../shared/Modal";

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
  const [isCreatePrDialogOpen, setIsCreatePrDialogOpen] = useState(false);
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [prHead, setPrHead] = useState("");
  const [prBase, setPrBase] = useState("");
  const [isPrCreating, setIsPrCreating] = useState(false);
  const [prCreateError, setPrCreateError] = useState<string | null>(null);
  const [prCreateSuccess, setPrCreateSuccess] = useState<string | null>(null);

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

    if (!remoteUrl || isSvn) return;

    setInfoState("loading");
    getGhRepoInfo(remoteUrl)
      .then((info) => {
        setRepoInfo(info);
        setInfoState("loaded");
        setPrBase(info.defaultBranch || "main");
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

  function handleOpenCreatePr() {
    if (!selectedRepository?.branchOrRevision) return;
    setPrHead(selectedRepository.branchOrRevision);
    setPrTitle("");
    setPrBody("");
    setPrCreateError(null);
    setPrCreateSuccess(null);
    setIsCreatePrDialogOpen(true);
  }

  async function handleCreatePr() {
    if (!remoteUrl || !prTitle.trim() || !prHead.trim() || !prBase.trim()) return;
    setIsPrCreating(true);
    setPrCreateError(null);
    setPrCreateSuccess(null);
    try {
      const pr = await createPr(remoteUrl, {
        title: prTitle.trim(),
        body: prBody.trim(),
        head: prHead.trim(),
        base: prBase.trim(),
      });
      setPrCreateSuccess(t("github.prCreated", { number: pr.number }));
      setPrs((prev) => [pr, ...prev]);
      setTimeout(() => {
        setIsCreatePrDialogOpen(false);
        setPrCreateSuccess(null);
      }, 3000);
    } catch (error) {
      setPrCreateError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsPrCreating(false);
    }
  }

  if (!remoteUrl || isSvn) return null;

  return (
    <section className="context-section github-section">
      <div className="section-kicker">GitHub</div>

      {infoState === "loading" ? (
        <p className="github-loading">{t("ui.loading")}</p>
      ) : infoState === "error" ? (
        <div className="github-empty">
          <p>{infoError || t("github.cannotFetchInfo")}</p>
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
                <dt>{t("github.primaryLanguage")}</dt>
                <dd>{repoInfo.primaryLanguage}</dd>
              </div>
            ) : null}
            <div>
              <dt>{t("github.defaultBranch")}</dt>
              <dd>{repoInfo.defaultBranch}</dd>
            </div>
          </dl>
          <div className="github-actions-row">
            <Button variant="secondary" onClick={() => ghOpenBrowser(remoteUrl, "repo")}>
              {t("github.openInBrowser")}
            </Button>
            <Button variant="secondary" onClick={() => ghOpenBrowser(remoteUrl, "prs")}>
              PR ({prState === "loaded" ? prs.length : "…"})
            </Button>
            <Button variant="secondary" onClick={() => ghOpenBrowser(remoteUrl, "actions")}>
              Actions
            </Button>
          </div>
          {selectedRepository?.branchOrRevision &&
          repoInfo.defaultBranch &&
          selectedRepository.branchOrRevision !== repoInfo.defaultBranch ? (
            <div className="github-create-pr-entry">
              <Button variant="default" onClick={handleOpenCreatePr}>
                {t("github.createPrLabel", { head: selectedRepository.branchOrRevision, base: repoInfo.defaultBranch })}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      {prState === "loading" ? (
        <p className="github-loading">{t("github.loadingPrs")}</p>
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
        <p className="github-muted">{t("github.noPrs")}</p>
      ) : null}

      {runState === "loaded" && runs.length > 0 ? (
        <div className="github-run-list">
          <div className="section-kicker github-list-title">Actions</div>
          {runs.slice(0, 3).map((run, idx) => (
            <div className="github-run-item" key={idx}>
              <span className={`github-run-status ${run.conclusion ?? "pending"}`}>
                {run.conclusion === "success" ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="成功"><path d="M20 6 9 17l-5-5" /></svg>
                ) : run.conclusion === "failure" ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="失败"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="等待中"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                )}
              </span>
              <span>{run.name}</span>
              <small>{run.headBranch}</small>
            </div>
          ))}
        </div>
      ) : null}

      <Modal
        open={isCreatePrDialogOpen}
        onClose={() => { if (!isPrCreating) setIsCreatePrDialogOpen(false); }}
        labelledBy="create-pr-title"
      >
        <ModalHeading
          eyebrow="GitHub"
          title={t("github.createPrTitle")}
          titleId="create-pr-title"
          onClose={() => { if (!isPrCreating) setIsCreatePrDialogOpen(false); }}
          t={t}
        />
        <div className="create-pr-form">
          <label className="create-pr-field">
            <span>{t("github.sourceBranch")}</span>
            <input
              type="text"
              value={prHead}
              onChange={(e) => setPrHead(e.target.value)}
              placeholder="feature-branch"
              disabled={isPrCreating}
            />
          </label>
          <label className="create-pr-field">
            <span>{t("github.targetBranch")}</span>
            <input
              type="text"
              value={prBase}
              onChange={(e) => setPrBase(e.target.value)}
              placeholder="main"
              disabled={isPrCreating}
            />
          </label>
          <label className="create-pr-field">
            <span>{t("github.titleField")}</span>
            <input
              type="text"
              value={prTitle}
              onChange={(e) => setPrTitle(e.target.value)}
              placeholder={t("github.titlePlaceholder")}
              disabled={isPrCreating}
              autoFocus
            />
          </label>
          <label className="create-pr-field">
            <span>{t("github.description")}</span>
            <textarea
              value={prBody}
              onChange={(e) => setPrBody(e.target.value)}
              placeholder={t("github.descriptionPlaceholder")}
              rows={3}
              disabled={isPrCreating}
            />
          </label>

          {prCreateError ? (
            <div className="create-pr-error">{prCreateError}</div>
          ) : null}
          {prCreateSuccess ? (
            <div className="create-pr-success">{prCreateSuccess}</div>
          ) : null}

          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setIsCreatePrDialogOpen(false)} disabled={isPrCreating}>
              {t("ui.cancel")}
            </Button>
            <Button variant="default" onClick={handleCreatePr} disabled={isPrCreating || !prTitle.trim()}>
              {isPrCreating ? t("github.creating") : t("github.createPrBtn")}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
