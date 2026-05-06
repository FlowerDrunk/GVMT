import { useState } from "react";
import type { OperationResult } from "../../lib/api";
import type { HistoryEntry } from "../../hooks/useOperationHistory";
import { VcsLabels } from "../../lib/constants";

interface OperationPanelProps {
  operationResults: OperationResult[];
  history: HistoryEntry[];
  onOpenSvnDownload: (target: "tortoise" | "sliksvn") => void;
}

function formatTimestamp(ts: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

function ResultCard({ result, onOpenSvnDownload }: { result: OperationResult; onOpenSvnDownload: (target: "tortoise" | "sliksvn") => void }) {
  return (
    <div className={`operation-card ${result.success ? "success" : "failed"}`}>
      <div className="operation-heading">
        <strong>{VcsLabels[result.vcsType]}</strong>
        <span>{result.summary}</span>
      </div>
      {result.warning ? (
        <div className="operation-warning">
          <p>{result.warning}</p>
          {result.missingSvnCli ? (
            <div className="hint-actions">
              <button className="secondary-button" type="button" onClick={() => onOpenSvnDownload("tortoise")}>
                下载 / 修改 TortoiseSVN
              </button>
              <button className="secondary-button" type="button" onClick={() => onOpenSvnDownload("sliksvn")}>
                下载 SlikSVN
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {result.output ? <pre>{result.output}</pre> : null}
    </div>
  );
}

export function OperationPanel({ operationResults, history, onOpenSvnDownload }: OperationPanelProps) {
  const [showHistory, setShowHistory] = useState(false);
  const hasCurrent = operationResults.length > 0;
  const hasHistory = history.length > 0;

  if (!hasCurrent && !hasHistory) return null;

  return (
    <section className="panel operation-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Operation result</p>
          <h3>{hasCurrent ? "最近操作" : "操作记录"}</h3>
        </div>
        <span className="soft-chip">{hasCurrent ? "本次" : `${history.length} 条`}</span>
      </div>

      {hasCurrent ? (
        <div className="operation-list">
          {operationResults.map((result) => (
            <ResultCard key={`${result.vcsType}-${result.operation}`} result={result} onOpenSvnDownload={onOpenSvnDownload} />
          ))}
        </div>
      ) : null}

      {hasHistory ? (
        <>
          <button
            className="ghost-button history-toggle"
            type="button"
            onClick={() => setShowHistory(!showHistory)}
          >
            {showHistory ? "收起历史记录" : `查看历史记录 (${history.length})`}
          </button>
          {showHistory ? (
            <div className="operation-list history-list">
              {history.map((entry) => (
                <div className="history-group" key={entry.id}>
                  <time className="history-time">{formatTimestamp(entry.timestamp)}</time>
                  {entry.results.map((result, i) => (
                    <ResultCard key={i} result={result} onOpenSvnDownload={onOpenSvnDownload} />
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
