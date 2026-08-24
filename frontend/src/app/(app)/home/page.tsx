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
import { useCapture } from "@/features/shell/AppShell";
import { EmptyState } from "@/shared/design-system/EmptyState";
import { SkeletonList } from "@/shared/design-system/SkeletonList";
import { Button } from "@/shared/design-system/Button";
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

      {/* Needs attention */}
      {data.attention.length === 0 ? (
        <p className="rounded-card border border-border bg-surface px-4 py-3 text-sm font-medium text-money-in">
          {t("home.nothingNeedsAttention")}
        </p>
      ) : (
        <section aria-label={t("home.needsAttention")} className="overflow-hidden rounded-card border border-border bg-surface">
          {data.attention.map((a) => (
            <div key={a.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
              <span className="text-sm font-medium">{a.text}</span>
            </div>
          ))}
        </section>
      )}

      {/* One Partner insight (Phase 5 §35): calm card, clay edge + compass only. */}
      {data.insight ? (
        <section
          aria-label={data.insight.statement}
          className="rounded-card border border-border border-l-[3px] border-l-brand bg-surface p-4"
        >
          <div className="flex items-start gap-2">
            <Compass aria-hidden size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-brand" />
            <div>
              <h3 className="text-[17px] font-semibold">{data.insight.statement}</h3>
              <p className="money mt-1 text-base font-semibold">{data.insight.figure}</p>
              <p className="text-sm text-text-secondary">{data.insight.context}</p>
              <p className="mt-2 inline-block rounded-pill bg-brand-tint px-2 py-0.5 text-[13px] font-semibold text-brand">
                From your records
              </p>
              <div className="mt-2">
                <Link href={data.insight.action_target} className="text-sm font-semibold text-brand underline-offset-2">
                  {data.insight.action_label} →
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}

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
