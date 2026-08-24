"use client";
// Debt detail + payment (Phase 5 §32): "Mark as paid" / "Pay supplier" reuses the
// capture pattern — AmountKeypad pre-filled with the outstanding amount, partial
// payments by editing. Words like "settlement" never appear.
import { useState } from "react";
import type { Debt } from "@/shared/api/types";
import { BottomSheet } from "@/shared/design-system/BottomSheet";
import { AmountKeypad } from "@/shared/design-system/AmountKeypad";
import { Button } from "@/shared/design-system/Button";
import { MoneyDisplay } from "@/shared/design-system/MoneyDisplay";
import { useToast } from "@/shared/design-system/Toast";
import { EMPTY_AMOUNT, fromMinor, isEmpty, toMinor, type AmountState } from "@/shared/design-system/amount";
import { useT } from "@/shared/i18n";
import { useSettleDebt } from "./api";

export function DebtDetailSheet({
  debt,
  kind,
  onClose,
}: {
  debt: Debt | null;
  kind: "receivable" | "payable";
  onClose: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const settle = useSettleDebt();
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState<AmountState>(EMPTY_AMOUNT);
  const [error, setError] = useState<string | null>(null);

  if (!debt) return null;
  const isReceivable = kind === "receivable";

  function closeAll() {
    setPaying(false);
    setAmount(EMPTY_AMOUNT);
    setError(null);
    onClose();
  }

  async function submitPayment() {
    if (!debt || isEmpty(amount)) return;
    setError(null);
    try {
      const result = await settle.mutateAsync({ debtId: debt.id, amountMinor: toMinor(amount) });
      const remaining = result.debt.outstanding;
      toast.show({
        message:
          remaining.amount_minor === 0
            ? t("debt.clearedToast", { name: debt.counterparty_name })
            : t("debt.remainingToast", { name: debt.counterparty_name, amount: remaining.display }),
      });
      closeAll();
    } catch {
      setError(t("debt.overpayError"));
    }
  }

  return (
    <>
      <BottomSheet
        open={!paying}
        title={debt.counterparty_name}
        onClose={closeAll}
        footer={
          <Button
            fullWidth
            data-testid="debt-pay"
            onClick={() => {
              setAmount(fromMinor(debt.outstanding.amount_minor)); // pre-filled, editable for partial
              setPaying(true);
            }}
          >
            {t(isReceivable ? "debt.markPaid" : "debt.paySupplier")}
          </Button>
        }
      >
        <div className="space-y-3 pb-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
              {t(isReceivable ? "debt.owesYou" : "debt.youOwe")}
            </span>
            <MoneyDisplay money={debt.outstanding} variant="hero" />
          </div>
          <p className="text-sm text-text-secondary">
            {t("debt.since", { date: new Date(debt.since).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) })}
            {debt.overdue ? ` · ${t("debt.overdue")}` : ""}
          </p>
        </div>
      </BottomSheet>

      <BottomSheet
        open={paying}
        title={t(isReceivable ? "debt.paymentFrom" : "debt.paymentTo", { name: debt.counterparty_name })}
        onClose={() => setPaying(false)}
        footer={
          <Button
            fullWidth
            disabled={isEmpty(amount)}
            loading={settle.isPending}
            loadingLabel={t("common.save")}
            onClick={() => void submitPayment()}
            data-testid="debt-pay-save"
          >
            {t("common.save")}
          </Button>
        }
      >
        <div className="space-y-3 pb-4">
          {error ? (
            <div role="alert" className="rounded-card bg-danger-fill p-3 text-sm font-medium text-danger">
              {error}
            </div>
          ) : null}
          <p className="money text-sm text-text-secondary">
            {t(isReceivable ? "debt.outstandingHint" : "debt.oweHint", {
              name: debt.counterparty_name,
              amount: debt.outstanding.display,
            })}
          </p>
          <AmountKeypad value={amount} onChange={setAmount} />
        </div>
      </BottomSheet>
    </>
  );
}
