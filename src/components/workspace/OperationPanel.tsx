import { useState } from "react";
import type { OperationResult, OperationLog } from "../../lib/api";
import type { Translator } from "../../lib/i18n";
import type { HistoryEntry } from "../../hooks/useOperationHistory";
import { VcsLabels } from "../../lib/constants";
import { Button } from "../ui/button";

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

function ResultCard({ result, onOpenSvnDownload, onRetryPush }: { result: OperationResult; onOpenSvnDownload: (target: "tortoise" | "sliksvn") => void; onRetryPush?: () => void }) {
  const isFailedPush = result.operation === "push" && !result.success;
  return (
    <div className={`operation-card ${result.success ? "success" : "failed"}`}>
      <div className="operation-heading">
        <strong>{VcsLabels[result.vcsType]}</strong>
        <span>{result.summary}</span>
        {isFailedPush && onRetryPush ? (
          <Button variant="secondary" size="sm" className="retry-push-btn" onClick={onRetryPush}>
            重试 Push
          </Button>
        ) : null}
      </div>
      {result.warning ? (
        <div className="operation-warning">
          <p>{result.warning}</p>
          {result.missingSvnCli ? (
            <div className="hint-actions">
              <Button variant="secondary" onClick={() => onOpenSvnDownload("tortoise")}>
                下载 / 修改 TortoiseSVN
              </Button>
              <Button variant="secondary" onClick={() => onOpenSvnDownload("sliksvn")}>
                下载 SlikSVN
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {result.output ? <pre>{result.output}</pre> : null}
    </div>
  );
}

function PersistedResultCard({ log }: { log: OperationLog }) {
  return (
    <div className={`operation-card ${log.success ? "success" : "failed"}`}>
      <div className="operation-heading">
        <strong>{VcsLabels[log.vcsType as keyof typeof VcsLabels] ?? log.vcsType}</strong>
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
  const [showHistory, setShowHistory] = useState(false);
  const [showPersisted, setShowPersisted] = useState(false);
  const hasCurrent = operationResults.length > 0;
  const hasHistory = history.length > 0;
  const hasPersisted = persistedLogs.length > 0;

  if (!hasCurrent && !hasHistory && !hasPersisted) return null;

  return (
    <section className="panel operation-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Operation result</p>
          <h3>{hasCurrent ? t("operation.recent") : t("operation.history")}</h3>
        </div>
        <div className="panel-title-row-actions">
          <span className="soft-chip">{hasCurrent ? t("operation.current") : `${history.length} ${t("operation.entryCount")}`}</span>
          {(hasHistory || hasPersisted) ? (
            <Button variant="ghost" onClick={onClearHistory} title="清除历史">
              ✕
            </Button>
          ) : null}
        </div>
      </div>

      {hasCurrent ? (
        <div className="operation-list">
          {operationResults.map((result) => (
            <ResultCard key={`${result.vcsType}-${result.operation}`} result={result} onOpenSvnDownload={onOpenSvnDownload} onRetryPush={onRetryPush} />
          ))}
        </div>
      ) : null}

      {hasHistory ? (
        <>
          <Button variant="ghost" className="history-toggle" onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? t("operation.hideHistory") : `${t("operation.showHistory")} (${history.length})`}
          </Button>
          {showHistory ? (
            <div className="operation-list history-list">
              {history.map((entry) => (
                <div className="history-group" key={entry.id}>
                  <time className="history-time">{formatTimestamp(entry.timestamp)}</time>
                  {entry.results.map((result, i) => (
                    <ResultCard key={i} result={result} onOpenSvnDownload={onOpenSvnDownload} onRetryPush={onRetryPush} />
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {hasPersisted ? (
        <>
          <Button variant="ghost" className="history-toggle" onClick={() => setShowPersisted(!showPersisted)}>
            {showPersisted ? "收起历史记录" : `查看历史记录 (${persistedLogs.length} 条)`}
          </Button>
          {showPersisted ? (
            <div className="operation-list history-list">
              {persistedLogs.map((log) => (
                <div className="history-group" key={log.id}>
                  <time className="history-time">{formatPersistedTimestamp(log.createdAt)}</time>
                  <PersistedResultCard log={log} />
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
