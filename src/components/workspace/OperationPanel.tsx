import { useState } from "react";
import type { OperationResult, OperationLog } from "../../lib/api";
import type { Translator } from "../../lib/i18n";
import { getVcsLabels } from "../../lib/constants";
import { Button } from "../ui/button";
import { Modal, ModalHeading } from "../shared/Modal";

interface OperationPanelProps {
  operationResults: OperationResult[];
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

function OperationRow({ summary, vcsType, success, timestamp, onClick, onRetryPush, isPushFailed, t }: {
  summary: string; vcsType: string; success: boolean; timestamp: string;
  onClick: () => void; onRetryPush?: () => void; isPushFailed: boolean; t: Translator;
}) {
  return (
    <div className={`op-row ${success ? "success" : "failed"}`} onClick={onClick}>
      <span className={`op-dot ${success ? "success" : "failed"}`} />
      <span className="op-summary">{summary}</span>
      <span className="op-vcs">{vcsType}</span>
      <time className="op-time">{timestamp}</time>
      {isPushFailed && onRetryPush ? (
        <Button variant="secondary" size="sm" className="op-retry" onClick={(e) => { e.stopPropagation(); onRetryPush(); }}>{t("ui.retryPush")}</Button>
      ) : (
        <svg className="op-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
      )}
    </div>
  );
}

export function OperationPanel({ operationResults, persistedLogs, t, onOpenSvnDownload, onClearHistory, onRetryPush }: OperationPanelProps) {
  const [showPersisted, setShowPersisted] = useState(false);
  const [detailData, setDetailData] = useState<DetailSource | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const hasCurrent = operationResults.length > 0;
  const hasPersisted = persistedLogs.length > 0;

  return (
    <section className="panel operation-panel">
      <OperationDetailModal data={detailData} open={detailOpen} onClose={() => setDetailOpen(false)} t={t} />

      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Operation result</p>
          <h3>{t("operation.recent")}</h3>
        </div>
        {hasPersisted ? (
          confirmClear ? (
            <div className="op-clear-confirm">
              <span>确认清空 {persistedLogs.length} 条记录？</span>
              <Button variant="secondary" size="sm" onClick={() => { onClearHistory(); setConfirmClear(false); }}>确认清空</Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>取消</Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>清空记录</Button>
          )
        ) : null}
      </div>

      <div className="op-list">
        {hasCurrent ? (
          operationResults.map((result, i) => (
            <OperationRow
              key={i}
              summary={result.summary}
              vcsType={getVcsLabels(t)[result.vcsType] ?? result.vcsType}
              success={result.success}
              timestamp={`#${i + 1}`}
              onClick={() => { setDetailData({ kind: "result", result }); setDetailOpen(true); }}
              onRetryPush={onRetryPush}
              isPushFailed={result.operation === "push" && !result.success}
              t={t}
            />
          ))
        ) : (
          <div className="op-empty">—</div>
        )}
      </div>

      {hasPersisted ? (
        <>
          <button className="op-history-toggle" type="button" onClick={() => setShowPersisted(!showPersisted)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: showPersisted ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 150ms ease" }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
            {showPersisted ? t("operation.hideHistory") : `${t("operation.showHistory")} (${persistedLogs.length})`}
          </button>
          {showPersisted ? (
            <div className="op-list">
              {persistedLogs.map((log) => (
                <OperationRow
                  key={log.id}
                  summary={log.summary}
                  vcsType={getVcsLabels(t)[log.vcsType as keyof ReturnType<typeof getVcsLabels>] ?? log.vcsType}
                  success={log.success}
                  timestamp={formatPersistedTimestamp(log.createdAt)}
                  onClick={() => { setDetailData({ kind: "log", log }); setDetailOpen(true); }}
                  isPushFailed={false}
                  t={t}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
