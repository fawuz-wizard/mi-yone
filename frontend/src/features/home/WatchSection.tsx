"use client";
// Business Watch (proactive monitoring layer). Alerts are computed server-side
// from recorded data only — this component renders them verbatim. Each row:
// what happened → tap → why it matters + what to consider doing + a link.
// Severity: critical (red) > warning (amber) > info (neutral).
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Info, TriangleAlert } from "lucide-react";
import { api } from "@/shared/api/client";
import type { WatchAlert, WatchResponse } from "@/shared/api/types";
import { BUSINESS_ID } from "@/shared/api/session";
import { useT } from "@/shared/i18n";

export function WatchSection() {
  const t = useT();
  const query = useQuery({
    queryKey: ["watch"],
    queryFn: () => api<WatchResponse>(`/businesses/${BUSINESS_ID}/watch`),
  });

  if (query.isPending || query.isError) return null; // Home's own error surface covers failures

  const alerts = query.data?.alerts ?? [];
  if (alerts.length === 0) {
    return (
      <p className="rounded-card border border-border bg-surface px-4 py-3 text-sm font-medium text-money-in">
        {t("home.nothingNeedsAttention")}
      </p>
    );
  }

  return (
    <section aria-label={t("watch.title")} data-testid="watch-section">
      <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
        {t("watch.title")}
      </h2>
      <div className="divide-y divide-border overflow-hidden rounded-card border border-border">
        {alerts.map((a) => (
          <WatchRow key={a.id} alert={a} />
        ))}
      </div>
    </section>
  );
}

function WatchRow({ alert }: { alert: WatchAlert }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const critical = alert.severity === "critical";
  const info = alert.severity === "info";
  const Icon = info ? Info : TriangleAlert;
  return (
    <div className={critical ? "bg-danger-fill" : info ? "bg-surface" : "bg-warning-fill"} data-testid="watch-row">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left"
      >
        <Icon
          aria-hidden
          size={18}
          strokeWidth={2}
          className={`shrink-0 ${critical ? "text-danger" : info ? "text-text-secondary" : "text-warning"}`}
        />
        <span className="money flex-1 text-sm font-medium text-text-primary">{alert.what}</span>
        {open ? (
          <ChevronDown aria-hidden size={18} className="shrink-0 text-text-secondary" />
        ) : (
          <ChevronRight aria-hidden size={18} className="shrink-0 text-text-secondary" />
        )}
      </button>
      {open ? (
        <div className="space-y-2 px-4 pb-3 pl-[46px]" data-testid="watch-details">
          <p className="text-sm text-text-primary">
            <span className="font-semibold">{t("watch.whyLabel")}: </span>
            {alert.why}
          </p>
          <p className="text-sm text-text-primary">
            <span className="font-semibold">{t("watch.actionLabel")}: </span>
            {alert.action}
          </p>
          <Link
            href={alert.target}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-pill bg-surface px-3 text-sm font-semibold text-brand"
          >
            {t("watch.open")}
            <ChevronRight aria-hidden size={14} />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
