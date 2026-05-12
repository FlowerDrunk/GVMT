import { useEffect, useRef, useState } from "react";
import { Modal, ModalHeading } from "../shared/Modal";

interface UpdateProgressDialogProps {
  open: boolean;
  onClose: () => void;
  lines: string[];
}

export function UpdateProgressDialog({ open, onClose, lines }: UpdateProgressDialogProps) {
  const [elapsed, setElapsed] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) { setElapsed(0); return; }
    const timer = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length, open]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <Modal open={open} onClose={onClose} labelledBy="update-progress-title" className="update-progress-modal">
      <ModalHeading eyebrow="SVN Update" title="正在更新..." titleId="update-progress-title" onClose={onClose} />
      <div className="update-progress-body">
        <div className="update-progress-timer">
          <span className="update-progress-spinner" />
          <span>已耗时 {mins}:{secs.toString().padStart(2, "0")}</span>
        </div>
        <div className="update-progress-lines">
          {lines.map((line, i) => (
            <div key={i} className="update-progress-line">{line}</div>
          ))}
          <div ref={endRef} />
        </div>
      </div>
    </Modal>
  );
}
