"use client";
// HealthHeader (Phase 5 §25–26, refined per owner brief): LEFT OVER is the one
// headline figure (visual apex, NOT green). The money in/out pair was removed
// from this card — MI YONE records business events, it is not a wallet, and
// those figures already live in the performance chart, trend tiles, Money tab
// and Reports. Pending records are excluded from server figures — "+N waiting".
import type { HealthPeriod } from "@/shared/api/types";
import { MoneyDisplay } from "@/shared/design-system/MoneyDisplay";
import { SegmentedTabs } from "@/shared/design-system/SegmentedTabs";
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
      {/* Owner: the sparkline that sat beside the headline figure was removed. */}
      <div className="mt-4">
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
    </section>
  );
}
