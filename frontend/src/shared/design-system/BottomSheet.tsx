"use client";
// BottomSheet (Phase 5 §12) — primary mobile input container.
// 20px top radius, focus trap + restore, scrim, Esc, dirty-state protection.
// ≥640px it renders as a centered modal (same component, Phase 4 §12).
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useT } from "@/shared/i18n";

export function BottomSheet({
  open,
  title,
  onClose,
  dirty = false,
  onConfirmDiscard,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  dirty?: boolean;
  onConfirmDiscard?: () => boolean; // return true to allow close
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const tryClose = useCallback(() => {
    if (dirty && onConfirmDiscard) {
      if (!onConfirmDiscard()) return;
    }
    onClose();
  }, [dirty, onConfirmDiscard, onClose]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement;
    const el = ref.current;
    el?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") tryClose();
      if (e.key === "Tab" && el) {
        // Simple focus trap.
        const focusables = el.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused.current?.focus();
    };
  }, [open, tryClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        aria-label={t("common.close")}
        className="absolute inset-0 bg-[var(--color-scrim)]"
        onClick={tryClose}
        tabIndex={-1}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative w-full max-w-[480px] rounded-t-sheet bg-surface shadow-overlay
                   pb-[env(safe-area-inset-bottom)] outline-none
                   motion-safe:animate-[miy-sheet-in_200ms_cubic-bezier(0.2,0,0,1)]
                   sm:rounded-dialog"
        style={{ maxHeight: "90dvh", display: "flex", flexDirection: "column" }}
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-9 rounded-pill bg-border sm:hidden" />
        <h2 className="px-4 pb-2 pt-3 text-[17px] font-semibold">{title}</h2>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">{children}</div>
        {footer ? <div className="border-t border-border p-4">{footer}</div> : null}
      </div>
    </div>
  );
}
