"use client";
// HealthHeader (Phase 5 §25–26): Money in · Money out · LEFT OVER (visual apex, NOT green).
// Pending records are excluded from server figures — "+N waiting" says so.
import type { HealthPeriod } from "@/shared/api/types";
import { MoneyDisplay } from "@/shared/design-system/MoneyDisplay";
import { SegmentedTabs } from "@/shared/design-system/SegmentedTabs";
import { Sparkline } from "@/shared/design-system/Sparkline";
import { useT } from "@/shared/i18n";

export type Period = "today" | "week" | "month";

export function HealthHeader({
  health,
  period,
  onPeriodChange,
  pendingCount,
  stale,
}: {
  health: HealthPeriod;
  period: Period;
  onPeriodChange: (p: Period) => void;
  pendingCount: number;
  stale?: boolean;
}) {
  const t = useT();
  return (
    <section
      aria-label={t("home.question")}
      className={`rounded-card border border-border bg-surface p-5 ${stale ? "opacity-80" : ""}`}
    >
      <SegmentedTabs
        ariaLabel={t("home.question")}
        value={period}
        onChange={onPeriodChange}
        tabs={[
          { value: "today", label: t("home.today") },
          { value: "week", label: t("home.week") },
          { value: "month", label: t("home.month") },
        ]}
      />
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
            {t("home.moneyIn")}
          </p>
          <MoneyDisplay money={health.money_in} direction="in" />
        </div>
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
            {t("home.moneyOut")}
          </p>
          <MoneyDisplay money={health.money_out} direction="out" />
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
            {t("home.leftOver")}
          </p>
          <div data-testid="left-over">
            <MoneyDisplay money={health.left_over} variant="hero" />
          </div>
          {pendingCount > 0 ? (
            <p className="mt-1 text-sm font-medium text-warning">
              {t("home.pendingSuffix", { count: pendingCount })}
            </p>
          ) : null}
          {health.comparison ? (
            <p className="money mt-1 text-sm text-text-secondary">{health.comparison}</p>
          ) : null}
        </div>
        <Sparkline data={health.trend} />
      </div>
    </section>
  );
}
