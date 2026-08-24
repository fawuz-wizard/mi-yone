"use client";
// Toast + UndoBar (Phase 4 §13). One at a time, bottom-center, aria-live polite.
// Errors never use toasts — they persist inline (§27).
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useT } from "@/shared/i18n";

export interface ToastData {
  message: string;
  tone?: "default" | "pending";
  undo?: () => void;
  extraAction?: { label: string; onPress: () => void };
}

const ToastContext = createContext<{ show: (t: ToastData) => void }>({ show: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [toast, setToast] = useState<ToastData | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((data: ToastData) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(data);
    timer.current = setTimeout(() => setToast(null), data.undo ? 5000 : 3000);
  }, []);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[76px] z-[60] flex justify-center px-4">
        {toast ? (
          <div
            className={`pointer-events-auto flex max-w-[420px] items-center gap-3 rounded-card px-4 py-3 shadow-float
              motion-safe:animate-[miy-fade-in_200ms] ${
                toast.tone === "pending" ? "bg-warning-fill text-text-primary" : "bg-text-primary text-text-inverse"
              }`}
            data-testid="toast"
          >
            <span className="money text-sm font-medium">{toast.message}</span>
            {toast.extraAction ? (
              <button
                className="text-sm font-bold underline underline-offset-2"
                onClick={() => {
                  toast.extraAction?.onPress();
                  dismiss();
                }}
              >
                {toast.extraAction.label}
              </button>
            ) : null}
            {toast.undo ? (
              <button
                className="text-sm font-bold underline underline-offset-2"
                onClick={() => {
                  toast.undo?.();
                  dismiss();
                }}
              >
                {t("common.undo")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
