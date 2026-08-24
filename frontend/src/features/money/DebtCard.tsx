"use client";
// Person-led debt row (Phase 4 §18): name first, amount owed, since-when;
// overdue = danger accent + the word "overdue" (never color alone).
import type { Debt } from "@/shared/api/types";
import { MoneyDisplay } from "@/shared/design-system/MoneyDisplay";
import { useT } from "@/shared/i18n";

export function DebtCard({ debt, onPress }: { debt: Debt; onPress: () => void }) {
  const t = useT();
  const since = new Date(debt.since).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <button
      onClick={onPress}
      data-testid="debt-card"
      className="flex min-h-[64px] w-full items-center gap-3 bg-surface px-4 py-3 text-left transition-colors duration-fast active:bg-sunken"
    >
      <span
        aria-hidden
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-pill font-bold ${
          debt.overdue ? "bg-danger-fill text-danger" : "bg-brand-tint text-brand"
        }`}
      >
        {debt.counterparty_name.charAt(0)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium">{debt.counterparty_name}</span>
        <span className="block text-sm text-text-secondary">
          {t("debt.since", { date: since })}
          {debt.overdue ? (
            <>
              {" · "}
              <span className="font-semibold text-danger">{t("debt.overdue")}</span>
            </>
          ) : null}
        </span>
      </span>
      <MoneyDisplay money={debt.outstanding} />
    </button>
  );
}
