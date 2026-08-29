"use client";
// Home (Phase 5 §23–26): identity → Health → Attention → one Insight → Quick actions.
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Compass, Package } from "lucide-react";
import { api } from "@/shared/api/client";
import type { DashboardResponse } from "@/shared/api/types";
import { BUSINESS_ID } from "@/shared/api/session";
import { HealthHeader, type Period } from "@/features/home/HealthHeader";
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
  const { openCapture, openChooser } = useCapture();
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

      {/* Performance over time (owner-approved amendment to Phase 4 §17).
          Self-hides when the ledger is empty — no wall of zeros for a new business. */}
      <PerformanceChart />

      {/* Progression/regression tiles — is each key number improving or declining? */}
      <TrendsRow />

      {/* Business Watch (upgraded "needs attention" — Phase 4 §13 slot):
          what happened, why it matters, what to consider doing. */}
      <WatchSection />

      {/* One Partner insight (Phase 5 §35). */}
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

      {/* Quick actions */}
      <section aria-label={t("home.quickActions")} className="grid grid-cols-2 gap-2">
        <QuickAction icon={<ArrowDownToLine aria-hidden size={20} />} label={t("home.recordMoneyIn")} onPress={() => openCapture("sale")} testId="qa-money-in" />
        <QuickAction icon={<ArrowUpFromLine aria-hidden size={20} />} label={t("home.recordMoneyOut")} onPress={() => openCapture("expense")} testId="qa-money-out" />
        <QuickAction icon={<Package aria-hidden size={20} />} label={t("home.addStock")} onPress={openChooser} testId="qa-stock" />
        <QuickAction icon={<Compass aria-hidden size={20} />} label={t("home.askPartner")} href="/partner" testId="qa-partner" />
      </section>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  href,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  href?: string;
  testId: string;
}) {
  const className =
    "flex min-h-[56px] items-center justify-center gap-2 rounded-card border border-border bg-surface " +
    "text-sm font-semibold text-text-primary active:bg-sunken";
  if (href) {
    return (
      <Link href={href} className={className} data-testid={testId}>
        {icon}
        {label}
      </Link>
    );
  }
  return (
    <button onClick={onPress} className={className} data-testid={testId}>
      {icon}
      {label}
    </button>
  );
}
