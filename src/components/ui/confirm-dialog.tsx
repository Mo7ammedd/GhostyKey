"use client";

import { useEffect, useId, useRef } from "react";
import { ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({ open, title, description, confirmLabel, busy = false, onClose, onConfirm }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current?.close();
  }, [open]);

  return (
    <dialog ref={ref} className="confirm-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div className="dialog-content">
        <div className="dialog-top"><div className="state-icon"><ShieldAlert size={23} strokeWidth={1.5} /></div><button className="icon-button" aria-label="Close dialog" onClick={onClose} disabled={busy}><X size={18} /></button></div>
        <h2 id={`${id}-title`}>{title}</h2>
        <p id={`${id}-description`}>{description}</p>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={onConfirm} busy={busy}>{confirmLabel}</Button>
        </div>
      </div>
    </dialog>
  );
}

