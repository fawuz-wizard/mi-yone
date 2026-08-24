"use client";
// ConfirmDialog (Phase 4 §13): consequence actions only; title = the consequence;
// focus lands on the SAFE action.
import { useEffect, useRef } from "react";
import { Button } from "./Button";

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[var(--color-scrim)]" aria-hidden />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-[360px] rounded-dialog bg-surface p-5 shadow-overlay"
      >
        <h2 className="text-[17px] font-semibold">{title}</h2>
        <p className="money mt-2 text-base text-text-secondary">{body}</p>
        <div className="mt-5 flex flex-col gap-2">
          <Button level={destructive ? "destructive" : "primary"} onClick={onConfirm} data-testid="confirm-action">
            {confirmLabel}
          </Button>
          <Button level="secondary" onClick={onCancel} ref={cancelRef}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
