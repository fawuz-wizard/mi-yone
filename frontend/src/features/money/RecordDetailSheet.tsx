"use client";
// Record detail + Fix (Phase 5 §28–29). Fixing is not editing: the flow explains the
// correction, confirms it, and the history stays visible. No Delete exists.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/shared/api/client";
import type { Transaction } from "@/shared/api/types";
import { BUSINESS_ID } from "@/shared/api/session";
import { BottomSheet } from "@/shared/design-system/BottomSheet";
import { Button } from "@/shared/design-system/Button";
import { ConfirmDialog } from "@/shared/design-system/ConfirmDialog";
import { AmountKeypad } from "@/shared/design-system/AmountKeypad";
import { MoneyDisplay } from "@/shared/design-system/MoneyDisplay";
import { useToast } from "@/shared/design-system/Toast";
import { EMPTY_AMOUNT, isEmpty, toDisplay, toMinor, type AmountState } from "@/shared/design-system/amount";
import { useT } from "@/shared/i18n";

export function RecordDetailSheet({
  transaction,
  onClose,
}: {
  transaction: Transaction | null;
  onClose: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const [fixing, setFixing] = useState(false);
  const [newAmount, setNewAmount] = useState<AmountState>(EMPTY_AMOUNT);
  const [confirming, setConfirming] = useState(false);

  const fixMutation = useMutation({
    mutationFn: ({ id, amountMinor }: { id: string; amountMinor: number }) =>
      api<Transaction>(`/businesses/${BUSINESS_ID}/transactions/${id}/fix`, {
        method: "POST",
        body: { amount_minor: amountMinor, reason: "correction" },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  if (!transaction) return null;
  const tx = transaction;
  const isIn = tx.type === "INCOME";

  function closeAll() {
    setFixing(false);
    setNewAmount(EMPTY_AMOUNT);
    setConfirming(false);
    onClose();
  }

  return (
    <>
      <BottomSheet
        open={!fixing}
        title={t("detail.title")}
        onClose={closeAll}
        footer={
          tx.status === "POSTED" ? (
            <div className="flex flex-col gap-2">
              <Button level="secondary" fullWidth onClick={() => setFixing(true)} data-testid="fix-record">
                {t("detail.fix")}
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-3 pb-4">
          <div className="flex items-center justify-between">
            <span className="text-base font-medium">{tx.description || tx.category_name}</span>
            <MoneyDisplay money={tx.amount} direction={isIn ? "in" : "out"} />
          </div>
          <DetailRow label={t("detail.when")} value={new Date(tx.occurred_at).toLocaleString("en-GB")} />
          <DetailRow label={t("detail.category")} value={tx.category_name} />
          <DetailRow label={t("detail.recordedBy")} value={tx.recorded_by} />
          <DetailRow
            label={t("detail.source")}
            value={tx.source === "SALE" ? t("detail.sourceSale") : t("detail.sourceManual")}
          />
          {tx.fixed ? (
            <div className="rounded-card bg-sunken p-3" data-testid="fix-history">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
                {t("detail.history")}
              </p>
              <p className="money mt-1 text-sm">
                {t("detail.fixedBy", { name: tx.fixed.by })} · {t("detail.was", { amount: tx.fixed.was.display })}{" "}
                {t("detail.now", { amount: tx.fixed.now.display })}
              </p>
            </div>
          ) : null}
        </div>
      </BottomSheet>

      <BottomSheet
        open={fixing}
        title={t("fix.title")}
        onClose={() => setFixing(false)}
        footer={
          <Button
            fullWidth
            disabled={isEmpty(newAmount)}
            onClick={() => setConfirming(true)}
            data-testid="fix-continue"
          >
            {t("fix.confirm")}
          </Button>
        }
      >
        <div className="space-y-4 pb-4">
          <p className="text-sm text-text-secondary">{t("fix.explain")}</p>
          <p className="money text-sm font-medium">
            {t("detail.was", { amount: tx.amount.display })}
          </p>
          <AmountKeypad value={newAmount} onChange={setNewAmount} />
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={confirming}
        title={t("fix.confirmTitle")}
        body={t("fix.confirmBody", { old: tx.amount.display, new: `Le ${toDisplay(newAmount)}` })}
        confirmLabel={t("fix.confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          void fixMutation
            .mutateAsync({ id: tx.id, amountMinor: toMinor(newAmount) })
            .then(() => {
              toast.show({ message: t("fix.done") });
              closeAll();
            })
            .catch(() => {
              setConfirming(false);
              toast.show({ message: t("error.generic") });
            });
        }}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border pb-2">
      <span className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
