"use client";
// Desktop table equivalent (Phase 5 §50): 48px rows, sticky header, right-aligned
// money, arrow-key navigation, row → detail.
import { useRef } from "react";
import type { Transaction } from "@/shared/api/types";
import { MoneyDisplay } from "@/shared/design-system/MoneyDisplay";
import { useT } from "@/shared/i18n";

export function MoneyTable({ rows, onOpen }: { rows: Transaction[]; onOpen: (tx: Transaction) => void }) {
  const t = useT();
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const next = e.key === "ArrowDown" ? index + 1 : index - 1;
    bodyRef.current?.querySelectorAll<HTMLTableRowElement>("tr")[next]?.focus();
  }

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-sunken text-left">
          <tr className="h-10">
            <th className="px-4 font-semibold text-text-secondary">{t("detail.what")}</th>
            <th className="px-4 font-semibold text-text-secondary">{t("detail.when")}</th>
            <th className="px-4 font-semibold text-text-secondary">{t("detail.recordedBy")}</th>
            <th className="px-4 text-right font-semibold text-text-secondary">{t("nav.money")}</th>
          </tr>
        </thead>
        <tbody ref={bodyRef} className="divide-y divide-border">
          {rows.map((tx, i) => (
            <tr
              key={tx.id}
              tabIndex={0}
              onClick={() => onOpen(tx)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onOpen(tx);
                onKeyDown(e, i);
              }}
              className="h-12 cursor-pointer transition-colors duration-fast hover:bg-sunken focus:bg-sunken"
            >
              <td className="px-4 font-medium">
                {tx.description || tx.category_name}
                {tx.fixed ? <span className="ml-2 text-[13px] text-text-secondary">{t("money.fixed")}</span> : null}
              </td>
              <td className="px-4 text-text-secondary">
                {new Date(tx.occurred_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </td>
              <td className="px-4 text-text-secondary">{tx.recorded_by}</td>
              <td className="px-4 text-right">
                <MoneyDisplay money={tx.amount} direction={tx.type === "INCOME" ? "in" : "out"} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
