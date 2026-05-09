import { type ReactNode } from "react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}

export function Modal({ open, onClose, labelledBy, className, children }: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) onClose();
    }}>
      <DialogContent className={className} aria-labelledby={labelledBy}>
        {children}
      </DialogContent>
    </Dialog>
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
        <DialogTitle asChild>
          <h3 id={titleId}>{title}</h3>
        </DialogTitle>
      </div>
      <Button variant="icon" onClick={onClose} title="关闭">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </Button>
    </div>
  );
}
