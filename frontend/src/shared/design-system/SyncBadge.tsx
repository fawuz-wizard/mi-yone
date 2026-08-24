"use client";
// SyncBadge (Phase 4 §13 / Phase 5 §38): hidden · saving · pending · failed.
// Plain words only — never "mutation", "queue", "conflict".
import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, AlertTriangle } from "lucide-react";
import { captureQueue, type PendingCapture } from "@/shared/capture-queue";
import { useT } from "@/shared/i18n";

export function SyncBadge() {
  const t = useT();
  const [items, setItems] = useState<PendingCapture[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => captureQueue.observe(setItems), []);
  useEffect(() => {
    const flush = () => void captureQueue.flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);

  if (items.length === 0) return null;
  const failed = items.some((i) => i.state === "failed");
  const saving = items.some((i) => i.state === "saving");
  const Icon = failed ? AlertTriangle : saving ? RefreshCw : CloudOff;

  return (
    <div className="relative">
      <button
        aria-label={t("sync.status")}
        onClick={() => setOpen((v) => !v)}
        className={`flex min-h-[44px] items-center gap-1 rounded-pill px-3 text-sm font-semibold ${
          failed ? "bg-danger-fill text-danger" : "bg-warning-fill text-warning"
        }`}
        data-testid="sync-badge"
      >
        <Icon size={16} strokeWidth={2} aria-hidden />
        {items.length}
      </button>
      {open ? (
        <div className="absolute right-0 top-12 z-40 w-72 rounded-card border border-border bg-surface p-3 shadow-float">
          <p className="text-sm text-text-secondary">{failed ? t("sync.failedTitle") : t("sync.pending")}</p>
          <ul className="mt-2 space-y-1">
            {items.map((i) => (
              <li key={i.idempotencyKey} className="money text-sm font-medium">
                {i.label}
              </li>
            ))}
          </ul>
          <button
            className="mt-3 min-h-[44px] w-full rounded-input bg-brand-tint text-sm font-semibold text-brand"
            onClick={() => void captureQueue.flush()}
          >
            {t("common.retry")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
