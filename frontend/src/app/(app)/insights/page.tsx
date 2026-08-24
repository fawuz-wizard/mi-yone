"use client";
// Insights / Reports: "What is changing in my business?" (Phase 4 A9 + owner's
// reports brief). Cash and booked profit are two different truths, both
// server-computed; the bridge sentence explains the gap (Phase 3 §6.1).
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Printer, Download } from "lucide-react";
import { useState } from "react";
import { api } from "@/shared/api/client";
import { BUSINESS_ID } from "@/shared/api/session";
import type { ReportPeriod, ReportResponse } from "@/shared/api/types";
import { Button } from "@/shared/design-system/Button";
import { EmptyState } from "@/shared/design-system/EmptyState";
import { MoneyDisplay } from "@/shared/design-system/MoneyDisplay";
import { SegmentedTabs } from "@/shared/design-system/SegmentedTabs";
import { SkeletonList } from "@/shared/design-system/SkeletonList";
import { useT } from "@/shared/i18n";

export default function InsightsPage() {
  const t = useT();
  const [period, setPeriod] = useState<ReportPeriod>("month");

  const query = useQuery({
    queryKey: ["report", period],
    queryFn: () => api<ReportResponse>(`/businesses/${BUSINESS_ID}/reports?period=${period}`),
    placeholderData: keepPreviousData,
  });
  const r = query.data;
  const hasActivity =
    r != null && (r.cash.money_in.amount_minor !== 0 || r.cash.money_out.amount_minor !== 0 || r.sales.count > 0);
  const inLoss = (r?.profit.profit.amount_minor ?? 0) < 0;

  return (
    <div className="space-y-4 pt-2 print:space-y-3" id="report-root">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t("reports.title")}</h1>
        <div className="flex gap-2 print:hidden">
          <a
            href={`/api/v1/businesses/${BUSINESS_ID}/reports/export?period=${period}`}
            download
            data-testid="export-csv"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-input border-[1.5px] border-brand px-4 text-sm font-semibold text-brand"
          >
            <Download size={16} aria-hidden /> {t("reports.exportCsv")}
          </a>
          <Button level="secondary" onClick={() => window.print()} data-testid="export-pdf">
            <Printer size={16} aria-hidden /> {t("reports.exportPdf")}
          </Button>
        </div>
      </div>
      <p className="sr-only">{t("reports.question")}</p>

      <div className="print:hidden">
        <SegmentedTabs
          ariaLabel={t("filter.dateLabel")}
          value={period}
          onChange={setPeriod}
          tabs={[
            { value: "today", label: t("reports.periodToday") },
            { value: "week", label: t("reports.periodWeek") },
            { value: "month", label: t("reports.periodMonth") },
            { value: "last_month", label: t("reports.periodLastMonth") },
          ]}
        />
      </div>

      {!r ? (
        <SkeletonList rows={4} />
      ) : !hasActivity ? (
        <EmptyState title={t("reports.emptyTitle")} body="" />
      ) : (
        <div className={query.isPlaceholderData ? "opacity-60" : ""}>
          <p className="money mb-3 text-sm font-semibold text-text-secondary">{r.period_label}</p>

          {/* Cash movement — the notebook truth. */}
          <section aria-label={t("reports.cashTitle")} className="rounded-card border border-border bg-surface p-4">
            <h2 className="text-[17px] font-semibold">{t("reports.cashTitle")}</h2>
            <div className="mt-3 space-y-2">
              <Row label={t("home.moneyIn")}>
                <MoneyDisplay money={r.cash.money_in} direction="in" />
              </Row>
              <Row label={t("home.moneyOut")}>
                <MoneyDisplay money={r.cash.money_out} direction="out" />
              </Row>
              <div className="flex items-center justify-between border-t border-border pt-2">
                <span className="text-base font-semibold">{t("home.leftOver")}</span>
                <MoneyDisplay money={r.cash.left_over} variant="hero" />
              </div>
            </div>
          </section>

          {/* Profit & loss — the booked truth, explained. */}
          <section
            aria-label={t("reports.profitTitle")}
            className="mt-3 rounded-card border border-border bg-surface p-4"
            data-testid="profit-card"
          >
            <h2 className="text-[17px] font-semibold">{t("reports.profitTitle")}</h2>
            <div className="mt-3 space-y-2">
              <Row label={t("reports.bookedRevenue")}>
                <MoneyDisplay money={r.profit.booked_revenue} />
              </Row>
              <Row label={t("reports.bookedExpenses")}>
                <MoneyDisplay money={r.profit.booked_expenses} />
              </Row>
              <div className="flex items-center justify-between border-t border-border pt-2">
                <span className="text-base font-semibold">{inLoss ? t("reports.loss") : t("reports.profit")}</span>
                <span className={inLoss ? "text-danger" : ""}>
                  <MoneyDisplay money={r.profit.profit} variant="hero" />
                </span>
              </div>
              {r.profit.credit_extended.amount_minor > 0 ? (
                <p className="money text-sm font-medium text-warning" data-testid="credit-bridge">
                  {t("reports.creditBridge", { amount: r.profit.credit_extended.display })}
                </p>
              ) : null}
              <p className="text-sm text-text-secondary">{t("reports.profitExplain")}</p>
            </div>
          </section>

          {/* Sales summary */}
          <section aria-label={t("reports.salesTitle")} className="mt-3 rounded-card border border-border bg-surface p-4">
            <h2 className="text-[17px] font-semibold">{t("reports.salesTitle")}</h2>
            <p className="money mt-1 text-base font-semibold" data-testid="sales-summary">
              {t("reports.salesCount", { count: r.sales.count, total: r.sales.total.display })}
            </p>
            {r.sales.top_products.length > 0 ? (
              <div className="mt-3">
                <p className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
                  {t("reports.topProducts")} · {t("reports.estimated")}
                </p>
                <div className="mt-1 divide-y divide-border">
                  {r.sales.top_products.map((p) => (
                    <div key={p.name} className="flex items-center justify-between py-2">
                      <span className="min-w-0 flex-1 truncate text-base">{p.name}</span>
                      <span className="mr-3 text-sm text-text-secondary">
                        {t("reports.unitsSold", { units: p.units })}
                      </span>
                      <MoneyDisplay money={p.revenue_estimate} />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {/* Expense breakdown */}
          {r.expenses_by_category.length > 0 ? (
            <section
              aria-label={t("reports.expensesTitle")}
              className="mt-3 rounded-card border border-border bg-surface p-4"
            >
              <h2 className="text-[17px] font-semibold">{t("reports.expensesTitle")}</h2>
              <div className="mt-1 divide-y divide-border">
                {r.expenses_by_category.map((c) => (
                  <div key={c.name} className="flex items-center justify-between py-2">
                    <span className="text-base">{c.name}</span>
                    <MoneyDisplay money={c.total} direction="out" />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Print footer (visible only on paper/PDF) */}
          <p className="hidden text-sm text-text-secondary print:block">
            {t("reports.printedFrom", { period: r.period_label })}
          </p>
        </div>
      )}
    </div>
  );
}


function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-base text-text-secondary">{label}</span>
      {children}
    </div>
  );
}
