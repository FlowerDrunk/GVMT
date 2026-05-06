import { useEffect, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}

export function Modal({ open, onClose, labelledBy, className, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className={`modal-card${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>
  );
}

export function ModalHeading({
  eyebrow,
  title,
  titleId,
  onClose,
}: {
  eyebrow: string;
  title: string;
  titleId: string;
  onClose: () => void;
}) {
  return (
    <div className="modal-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h3 id={titleId}>{title}</h3>
      </div>
      <button className="icon-button" type="button" onClick={onClose} title="关闭">
        ×
      </button>
    </div>
  );
}
