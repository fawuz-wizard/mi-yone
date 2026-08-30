"use client";
// Progression/regression tiles (visual trend layer). Every number, direction,
// and tone is computed server-side from the ledger; this renders verbatim.
// ↑ improving · ↓ declining · → stable; no arrow when history is insufficient
// (a metric is never labeled improving/declining without enough data).
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import type { TrendMetric, TrendsResponse } from "@/shared/api/types";
import { BUSINESS_ID } from "@/shared/api/session";
import { useT } from "@/shared/i18n";

export function TrendsRow() {
  const t = useT();
  const query = useQuery({
    queryKey: ["trends"],
    queryFn: () => api<TrendsResponse>(`/businesses/${BUSINESS_ID}/analytics/trends?range=30d`),
  });

  if (query.isPending || query.isError) return null;
  const metrics = query.data?.metrics ?? [];
  // A brand-new business has nothing to compare — hide rather than show zeros.
  const meaningful = metrics.some((m) => m.direction !== null || (m.current !== "Le 0" && m.current !== "0"));
  if (!meaningful) return null;

  return (
    <section aria-label={t("trends.title")} data-testid="trends-row">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">{t("trends.title")}</h2>
        <span className="text-xs text-text-secondary">{t("trends.vsPrevious")}</span>
      </div>
      {/* Scrollable region must be keyboard-reachable (axe: scrollable-region-focusable). */}
      <div
        className="-mx-4 overflow-x-auto px-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring"
        tabIndex={0}
        role="group"
        aria-label={t("trends.title")}
      >
        <div className="flex min-w-max gap-2">
          {metrics.map((m) => (
            <TrendTile key={m.key} metric={m} />
          ))}
        </div>
      </div>

      {/* Contribution analysis (M17): the largest measured changes, phrased
          factually by the server — contribution, never causation. */}
      {(query.data?.contributors ?? []).length > 0 ? (
        <div className="mt-2 rounded-card border border-border bg-surface px-4 py-3" data-testid="trend-contributors">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
            {t("trends.changedMost")}
          </h3>
          <ul className="mt-1 space-y-1.5">
            {(query.data?.contributors ?? []).map((c) => (
              <li key={c.id} className="text-sm text-text-primary" data-testid="contributor-line">
                {c.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function TrendTile({ metric }: { metric: TrendMetric }) {
  const t = useT();
  const toneClass =
    metric.tone === "good" ? "text-money-in" : metric.tone === "bad" ? "text-danger" : "text-text-secondary";
  const arrow = metric.direction === "up" ? "↑" : metric.direction === "down" ? "↓" : metric.direction === "flat" ? "→" : null;
  const dirLabel =
    metric.direction === "flat"
      ? t("trends.stable")
      : metric.tone === "good"
        ? t("trends.improving")
        : metric.tone === "bad"
          ? t("trends.declining")
          : null;
  return (
    <div
      className="w-[132px] shrink-0 rounded-card border border-border bg-surface px-3 py-2.5"
      data-testid={`trend-${metric.key}`}
    >
      <p className="text-[12px] font-semibold uppercase tracking-wide text-text-secondary">{t(`trends.${metric.key}`)}</p>
      <p className="money mt-0.5 truncate text-base font-bold text-text-primary">{metric.current}</p>
      {arrow !== null ? (
        <p className={`money mt-0.5 text-sm font-semibold ${toneClass}`}>
          <span aria-hidden>{arrow}</span>
          {metric.change_pct !== null ? ` ${metric.change_pct}%` : ""}
          {dirLabel ? <span className="sr-only"> {dirLabel}</span> : null}
        </p>
      ) : (
        <p className="mt-0.5 truncate text-xs text-text-secondary">{t("trends.notEnoughData")}</p>
      )}
    </div>
  );
}
