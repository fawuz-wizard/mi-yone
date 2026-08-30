"use client";
// Overview refinement (M17): two compact cards under the health header.
// ProfitRow — estimated profit + server-computed margin for the selected
// period (margin honestly absent on a zero-revenue base). SpendingCard — the
// top expense categories for the period; Reports keeps the full breakdown.
// All figures are server display strings rendered verbatim (rule 2).
import Link from "next/link";
import type { DashboardResponse } from "@/shared/api/types";
import { useT } from "@/shared/i18n";

export function ProfitRow({ profit }: { profit: DashboardResponse["profit"] }) {
  const t = useT();
  if (!profit) return null;
  const negative = profit.estimated.amount_minor < 0;
  return (
    <section
      aria-label={t("home.profitTitle")}
      data-testid="profit-row"
      className="rounded-card border border-border bg-surface px-4 py-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
            {t("home.profitTitle")}
          </h2>
          <p className={`money mt-0.5 text-lg font-bold ${negative ? "text-danger" : "text-text-primary"}`}>
            {profit.estimated.display}
          </p>
        </div>
        {profit.margin_pct !== null ? (
          <span
            className="money shrink-0 rounded-pill bg-sunken px-2.5 py-1 text-[13px] font-semibold text-text-primary"
            data-testid="profit-margin"
          >
            {t("home.profitMargin", { pct: profit.margin_pct })}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-text-secondary">{t("home.profitExplain")}</p>
    </section>
  );
}

export function SpendingCard({ spending }: { spending: DashboardResponse["spending"] }) {
  const t = useT();
  if (!spending || spending.top.length === 0) return null;
  return (
    <section
      aria-label={t("home.spendingTitle")}
      data-testid="spending-card"
      className="rounded-card border border-border bg-surface px-4 py-3"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
          {t("home.spendingTitle")}
        </h2>
        <p className="money text-sm font-semibold text-text-secondary">{spending.total.display}</p>
      </div>
      <ul className="mt-1.5 space-y-1.5">
        {spending.top.map((c) => (
          <li key={c.name} className="flex items-baseline justify-between gap-3" data-testid="spending-category">
            <span className="min-w-0 truncate text-sm font-medium text-text-primary">{c.name}</span>
            <span className="money shrink-0 text-sm font-semibold text-text-primary">{c.total.display}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/insights"
        className="mt-2 inline-block text-sm font-semibold text-brand underline-offset-2"
        data-testid="spending-see-all"
      >
        {t("home.spendingSeeAll")} →
      </Link>
    </section>
  );
}
