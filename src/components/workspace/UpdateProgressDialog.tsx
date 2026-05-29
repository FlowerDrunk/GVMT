import { useEffect, useRef, useState } from "react";
import { Modal, ModalHeading } from "../shared/Modal";
import { Button } from "../ui/button";
import type { Translator } from "../../lib/i18n";

/** Lines that are not per-file SVN output (summary, conflicts, step labels, etc.) */
function isSvnMetaLine(line: string): boolean {
  const first = line.trimStart().charAt(0);
  if (!first) return true;
  // SVN file status letters: U(pdate), A(dd), D(elete), G(merged), C(onflict), E(xists)
  // Lines starting with these are per-file changes
  return !/^[UADGCE\s]/.test(line.trimStart());
}

interface UpdateProgressDialogProps {
  open: boolean;
  onClose: () => void;
  lines: string[];
  onCancel?: () => void;
  title?: string;
  progress?: number | null;
  stats?: { files: number; sizeMb?: number; speedKbps?: number } | null;
  t: Translator;
  /** When true, clicking the backdrop won't close the dialog */
  preventBackdropClose?: boolean;
  startedAt?: number; // epoch seconds
  /** When true, the spinner stops and shows a checkmark instead */
  completed?: boolean;
}

export function UpdateProgressDialog({ open, onClose, lines, onCancel, title = "SVN Update", progress, stats, t, preventBackdropClose, startedAt, completed }: UpdateProgressDialogProps) {
  const [tick, setTick] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (completed) return;
    const timer = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, [open, completed]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length, open]);

  const elapsed = startedAt ? Math.max(0, Math.floor(Date.now() / 1000 - startedAt)) : tick;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <Modal open={open} onClose={onClose} labelledBy="update-progress-title" className="update-progress-modal" preventBackdropClose={preventBackdropClose}>
      <ModalHeading eyebrow={title} title={t("update.executing")} titleId="update-progress-title" onClose={onClose} t={t} />
      <div className="update-progress-body">
        <div className="update-progress-timer">
          {completed ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <span className="update-progress-spinner" />
          )}
          <span>{t("update.elapsed")} {mins}:{secs.toString().padStart(2, "0")}</span>
          {onCancel ? (
            <Button variant="secondary" size="sm" onClick={onCancel} className="update-progress-cancel-btn">
              {t("ui.cancel")}
            </Button>
          ) : null}
        </div>
        {progress != null ? (
          <div className="update-progress-bar-track">
            <div className="update-progress-bar-fill" style={{ width: `${progress}%` }} />
            <span className="update-progress-bar-label">{progress}%</span>
          </div>
        ) : null}
        {stats ? (
          <div className="update-progress-stats">
            {stats.files > 0 ? <span>{t("update.filesCount", { count: stats.files })}</span> : null}
            {stats.sizeMb != null ? <span>{stats.sizeMb.toFixed(1)} MiB</span> : null}
            {stats.speedKbps != null ? <span>{stats.speedKbps < 1024 ? `${stats.speedKbps.toFixed(0)} KiB/s` : `${(stats.speedKbps / 1024).toFixed(1)} MiB/s`}</span> : null}
          </div>
        ) : null}
        <div className="update-progress-lines">
          {lines.map((line, i) => (
            <div key={i} className={`update-progress-line ${isSvnMetaLine(line) ? "is-meta" : ""}`}>{line}</div>
          ))}
          <div ref={endRef} />
        </div>
      </div>
    </Modal>
  );
}
