import { useState } from "react";
import type { OperationResult, OperationLog } from "../../lib/api";
import type { Translator } from "../../lib/i18n";
import type { HistoryEntry } from "../../hooks/useOperationHistory";
import { getVcsLabels } from "../../lib/constants";
import { Button } from "../ui/button";
import { Modal, ModalHeading } from "../shared/Modal";

interface OperationPanelProps {
  operationResults: OperationResult[];
  history: HistoryEntry[];
  persistedLogs: OperationLog[];
  t: Translator;
  onOpenSvnDownload: (target: "tortoise" | "sliksvn") => void;
  onClearHistory: () => void;
  onRetryPush?: () => void;
}

function formatTimestamp(ts: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

function formatPersistedTimestamp(dateStr: string) {
  try {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return dateStr;
  }
}

export type DetailSource =
  | { kind: "result"; result: OperationResult; timestamp?: never }
  | { kind: "log"; log: OperationLog; timestamp?: string };

export function OperationDetailModal({ data, open, onClose, t }: { data: DetailSource | null; open: boolean; onClose: () => void; t: Translator }) {
  if (!data) return null;
  const title = data.kind === "result" ? data.result.summary : data.log.summary;
  const vcsType = data.kind === "result" ? data.result.vcsType : data.log.vcsType;
  const operation = data.kind === "result" ? data.result.operation : data.log.operation;
  const success = data.kind === "result" ? data.result.success : data.log.success;
  const output = data.kind === "result" ? data.result.output : data.log.output;
  const warning = data.kind === "result" ? data.result.warning : data.log.warning;
  const ts = data.kind === "result" ? data.timestamp : data.log.createdAt;

  return (
    <Modal open={open} onClose={onClose} labelledBy="operation-detail-title" className="operation-detail-modal">
      <ModalHeading
        eyebrow={`${getVcsLabels(t)[vcsType] ?? vcsType} · ${operation}`}
        title={title}
        titleId="operation-detail-title"
        onClose={onClose}
        t={t}
      />
      <div className="operation-detail-body">
        <div className="operation-detail-status">
          <span className={`status-pill ${success ? "success" : "failed"}`}>{success ? t("ui.success") : t("ui.failed")}</span>
          {ts ? <time>{ts}</time> : null}
        </div>
        {warning ? (
          <div className="operation-detail-warning">
            <strong>{t("ui.warning")}</strong>
            <p>{warning}</p>
          </div>
        ) : null}
        {output ? (
          <div className="operation-detail-output">
            <strong>{t("ui.output")}</strong>
            <pre>{output}</pre>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function ResultCard({ result, onOpenSvnDownload, onRetryPush, onShowDetail, t }: {
  result: OperationResult;
  onOpenSvnDownload: (target: "tortoise" | "sliksvn") => void;
  onRetryPush?: () => void;
  onShowDetail?: (data: DetailSource) => void;
  t: Translator;
}) {
  const isFailedPush = result.operation === "push" && !result.success;
  return (
    <div className={`operation-card ${result.success ? "success" : "failed"}`}
      onDoubleClick={() => onShowDetail?.({ kind: "result", result })}
      title={t("ui.doubleClickDetail")}
    >
      <div className="operation-heading">
        <strong>{getVcsLabels(t)[result.vcsType]}</strong>
        <span>{result.summary}</span>
        {isFailedPush && onRetryPush ? (
          <Button variant="secondary" size="sm" className="retry-push-btn" onClick={onRetryPush}>
            {t("ui.retryPush")}
          </Button>
        ) : null}
      </div>
      {result.warning ? (
        <div className="operation-warning">
          <p>{result.warning}</p>
          {result.missingSvnCli ? (
            <div className="hint-actions">
              <Button variant="secondary" onClick={() => onOpenSvnDownload("tortoise")}>
                {t("status.downloadTortoise")}
              </Button>
              <Button variant="secondary" onClick={() => onOpenSvnDownload("sliksvn")}>
                {t("status.downloadSlikSvn")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {result.output ? <pre>{result.output}</pre> : null}
    </div>
  );
}

function PersistedResultCard({ log, onShowDetail, t }: { log: OperationLog; onShowDetail?: (data: DetailSource) => void; t: Translator }) {
  return (
    <div className={`operation-card ${log.success ? "success" : "failed"}`}
      onDoubleClick={() => onShowDetail?.({ kind: "log", log })}
      title={t("ui.doubleClickDetail")}
    >
      <div className="operation-heading">
        <strong>{getVcsLabels(t)[log.vcsType as keyof ReturnType<typeof getVcsLabels>] ?? log.vcsType}</strong>
        <span>{log.summary}</span>
      </div>
      {log.warning ? (
        <div className="operation-warning">
          <p>{log.warning}</p>
        </div>
      ) : null}
      {log.output ? <pre>{log.output}</pre> : null}
    </div>
  );
}

export function OperationPanel({ operationResults, history, persistedLogs, t, onOpenSvnDownload, onClearHistory, onRetryPush }: OperationPanelProps) {
  const [showPersisted, setShowPersisted] = useState(false);
  const [detailData, setDetailData] = useState<DetailSource | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const hasCurrent = operationResults.length > 0;
  const hasPersisted = persistedLogs.length > 0;

  function handleShowDetail(data: DetailSource) {
    setDetailData(data);
    setDetailOpen(true);
  }

  if (!hasCurrent && !hasPersisted) return null;

  return (
    <section className="panel operation-panel">
      <OperationDetailModal data={detailData} open={detailOpen} onClose={() => setDetailOpen(false)} t={t} />

      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Operation result</p>
          <h3>{hasCurrent ? t("operation.recent") : t("operation.history")}</h3>
        </div>
        <div className="panel-title-row-actions">
          <span className="soft-chip">{hasCurrent ? t("operation.current") : `${persistedLogs.length} ${t("operation.entryCount")}`}</span>
          {hasPersisted ? (
            <Button variant="ghost" onClick={onClearHistory} title="Clear history">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
            </Button>
          ) : null}
        </div>
      </div>

      {hasCurrent ? (
        <div className="operation-list">
          {operationResults.map((result) => (
            <ResultCard key={`${result.vcsType}-${result.operation}`} result={result} onOpenSvnDownload={onOpenSvnDownload} onRetryPush={onRetryPush} onShowDetail={handleShowDetail} t={t} />
          ))}
        </div>
      ) : null}

      {hasPersisted ? (
        <>
          <Button variant="ghost" className="history-toggle" onClick={() => setShowPersisted(!showPersisted)}>
            {showPersisted ? t("operation.hideHistory") : `${t("operation.showHistory")} (${persistedLogs.length})`}
          </Button>
          {showPersisted ? (
            <div className="operation-list history-list">
              {persistedLogs.map((log) => (
                <div className="history-group" key={log.id}>
                  <time className="history-time">{formatPersistedTimestamp(log.createdAt)}</time>
                  <PersistedResultCard log={log} onShowDetail={handleShowDetail} t={t} />
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
