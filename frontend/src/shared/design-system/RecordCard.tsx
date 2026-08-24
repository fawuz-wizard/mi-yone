"use client";
// RecordCard (Phase 4 §13): one financial event in a list.
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import type { Transaction } from "@/shared/api/types";
import { MoneyDisplay } from "./MoneyDisplay";
import { useT } from "@/shared/i18n";

export function RecordCard({
  transaction,
  pending = false,
  onPress,
}: {
  transaction: Transaction;
  pending?: boolean;
  onPress?: () => void;
}) {
  const t = useT();
  const isIn = transaction.type === "INCOME";
  const Icon = isIn ? ArrowDownToLine : ArrowUpFromLine;
  const time = new Date(transaction.occurred_at).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <button
      onClick={onPress}
      data-testid="record-card"
      className={`flex w-full items-center gap-3 bg-surface px-4 py-3 text-left transition-colors duration-fast
        active:bg-sunken min-h-[56px] ${pending ? "border-l-[3px] border-warning" : ""}`}
    >
      <span
        aria-hidden
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-pill ${
          isIn ? "bg-money-in-tint text-money-in" : "bg-sunken text-text-primary"
        }`}
      >
        <Icon size={18} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium">
          {transaction.description || transaction.category_name}
        </span>
        <span className="block text-sm text-text-secondary">
          {time}
          {transaction.fixed ? ` · ${t("money.fixed")}` : ""}
          {pending ? ` · ${t("money.pending")}` : ""}
        </span>
      </span>
      <MoneyDisplay money={transaction.amount} direction={isIn ? "in" : "out"} />
    </button>
  );
}
