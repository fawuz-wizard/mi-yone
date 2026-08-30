"use client";
// Home (Phase 5 §23–26): identity → Health → Attention → one Insight → Quick actions.
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/shared/api/client";
import type { DashboardResponse } from "@/shared/api/types";
import { BUSINESS_ID } from "@/shared/api/session";
import { HealthHeader, type Period } from "@/features/home/HealthHeader";
import { ProfitRow, SpendingCard } from "@/features/home/OverviewCards";
import { PerformanceChart } from "@/features/home/PerformanceChart";
import { TrendsRow } from "@/features/home/TrendsRow";
import { WatchSection } from "@/features/home/WatchSection";
import { useCapture } from "@/features/shell/AppShell";
import { EmptyState } from "@/shared/design-system/EmptyState";
import { SkeletonList } from "@/shared/design-system/SkeletonList";
import { Button } from "@/shared/design-system/Button";
import { InsightCard } from "@/shared/design-system/InsightCard";
import { captureQueue } from "@/shared/capture-queue";
import { useT } from "@/shared/i18n";

export default function HomePage() {
  const t = useT();
  const { openCapture } = useCapture();
  const [period, setPeriod] = useState<Period>("today");
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => captureQueue.observe((items) => setPendingCount(items.length)), []);

  const query = useQuery({
    queryKey: ["dashboard", period],
    queryFn: () => api<DashboardResponse>(`/businesses/${BUSINESS_ID}/analytics/dashboard?period=${period}`),
    placeholderData: keepPreviousData,
  });

  if (query.isPending) {
    return (
      <div className="space-y-4 pt-2">
        <SkeletonList rows={3} />
      </div>
    );
  }

  if (query.isError && !query.data) {
    return (
      <div className="pt-2">
        <EmptyState
          title={t("home.updateFailed")}
          body=""
          action={
            <Button fullWidth level="secondary" onClick={() => void query.refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      </div>
    );
  }

  const data = query.data as DashboardResponse;
  const hasRecords = data.health.money_in.amount_minor > 0 || data.health.money_out.amount_minor > 0;

  return (
    <div className="space-y-4 pt-2">
      {query.isError ? (
        <p role="status" className="rounded-card bg-warning-fill px-3 py-2 text-sm font-medium text-warning">
          {t("home.updateFailed")}
        </p>
      ) : null}

      <HealthHeader
        health={data.health}
        period={period}
        onPeriodChange={setPeriod}
        pendingCount={pendingCount}
        stale={query.isPlaceholderData}
      />

      {/* Overview refinement (M17): estimated profit + margin for the selected
          period, computed by the same logic as Reports. Self-hides when empty. */}
      <ProfitRow profit={data.profit} />

      {/* Performance over time (owner-approved amendment to Phase 4 §17).
          Self-hides when the ledger is empty — no wall of zeros for a new business. */}
      <PerformanceChart />

      {/* Progression/regression tiles — is each key number improving or declining? */}
      <TrendsRow />

      {/* Business Watch (upgraded "needs attention" — Phase 4 §13 slot):
          what happened, why it matters, what to consider doing. */}
      <WatchSection />

      {/* Where the money went this period (M17) — summary only; Reports keeps
          the full category breakdown. Self-hides with no expenses. */}
      <SpendingCard spending={data.spending} />

      {/* One Partner insight (Phase 5 §35) — now the Partner's overview line
          when history allows, else the deterministic top-expense insight. */}
      {data.insight ? <InsightCard insight={data.insight} provenanceLabel={t("partner.fromRecords")} /> : null}

      {!hasRecords ? (
        <EmptyState
          title={t("home.emptyTitle")}
          body={t("home.emptyBody")}
          action={
            <Button fullWidth onClick={() => openCapture("sale")}>
              {t("home.recordMoneyIn")}
            </Button>
          }
        />
      ) : null}

      {/* Quick-actions grid removed per owner decision: every entry path lives
          behind the + button, and Partner has its own tab — no duplicates. */}
    </div>
  );
}
