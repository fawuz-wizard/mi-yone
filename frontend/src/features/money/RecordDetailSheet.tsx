"use client";
// Record detail + Fix + Remove (Phase 5 §28–29 + owner's transactions brief).
// "Edit" = Fix: reversal + corrected record, any field (amount, category, note,
// date), history visible. "Delete" = Remove: a reversal that takes the record out
// of the books but keeps it in history — financial records are never destroyed.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/shared/api/client";
import type { FixTransactionInput, Transaction } from "@/shared/api/types";
import { BUSINESS_ID } from "@/shared/api/session";
import { BottomSheet } from "@/shared/design-system/BottomSheet";
import { Button } from "@/shared/design-system/Button";
import { ChipPicker } from "@/shared/design-system/ChipPicker";
import { ConfirmDialog } from "@/shared/design-system/ConfirmDialog";
import { AmountKeypad } from "@/shared/design-system/AmountKeypad";
import { MoneyDisplay } from "@/shared/design-system/MoneyDisplay";
import { useToast } from "@/shared/design-system/Toast";
import { EMPTY_AMOUNT, fromMinor, isEmpty, toDisplay, toMinor, type AmountState } from "@/shared/design-system/amount";
import { useT } from "@/shared/i18n";
import { useCategories } from "@/features/capture/api";

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
  const [newCategoryId, setNewCategoryId] = useState<string | null>(null);
  const [newNote, setNewNote] = useState("");
  const [newDate, setNewDate] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const categories = useCategories(transaction?.type ?? "EXPENSE", fixing);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["transactions"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["watch"] });
      void qc.invalidateQueries({ queryKey: ["trends"] });
    void qc.invalidateQueries({ queryKey: ["performance"] });
  };

  const fixMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: FixTransactionInput }) =>
      api<Transaction>(`/businesses/${BUSINESS_ID}/transactions/${id}/fix`, { method: "POST", body: input }),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/businesses/${BUSINESS_ID}/transactions/${id}/reverse`, { method: "POST", body: {} }),
    onSuccess: invalidate,
  });

  if (!transaction) return null;
  const tx = transaction;
  const isIn = tx.type === "INCOME";

  function closeAll() {
    setFixing(false);
    setNewAmount(EMPTY_AMOUNT);
    setNewCategoryId(null);
    setNewNote("");
    setNewDate("");
    setConfirming(false);
    setConfirmingRemove(false);
    onClose();
  }

  function beginFix() {
    setNewAmount(fromMinor(tx.amount.amount_minor));
    setNewCategoryId(null); // null = keep current category
    setNewNote(tx.description ?? "");
    setNewDate(tx.occurred_at.slice(0, 10));
    setFixing(true);
  }

  function submitFix() {
    const input: FixTransactionInput = { reason: "correction" };
    if (!isEmpty(newAmount) && toMinor(newAmount) !== tx.amount.amount_minor) input.amount_minor = toMinor(newAmount);
    if (newCategoryId) input.category_id = newCategoryId;
    if ((newNote || null) !== tx.description) input.description = newNote;
    if (newDate && newDate !== tx.occurred_at.slice(0, 10)) input.occurred_at = `${newDate}T12:00:00`;
    void fixMutation
      .mutateAsync({ id: tx.id, input })
      .then(() => {
        toast.show({ message: t("fix.done") });
        closeAll();
      })
      .catch(() => {
        setConfirming(false);
        toast.show({ message: t("error.generic") });
      });
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
              <Button level="secondary" fullWidth onClick={beginFix} data-testid="fix-record">
                {t("detail.fix")}
              </Button>
              <Button level="tertiary" fullWidth onClick={() => setConfirmingRemove(true)} data-testid="remove-record">
                {t("detail.remove")}
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

      {/* The Fix form — looks like an ordinary edit; performs reversal + re-entry. */}
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
          <AmountKeypad value={newAmount} onChange={setNewAmount} />
          {(categories.data?.length ?? 0) > 0 ? (
            <ChipPicker
              label={t("fix.newCategory")}
              options={(categories.data ?? []).map((c) => ({ id: c.id, label: c.name }))}
              selectedId={newCategoryId ?? categories.data?.find((c) => c.name === tx.category_name)?.id ?? null}
              onSelect={setNewCategoryId}
            />
          ) : null}
          <label className="block">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
              {t("fix.newNote")}
            </span>
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="mt-1 min-h-[48px] w-full rounded-input border border-border-input bg-surface px-3 text-base"
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
              {t("fix.newDate")}
            </span>
            <input
              type="date"
              value={newDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setNewDate(e.target.value)}
              className="mt-1 min-h-[48px] w-full rounded-input border border-border-input bg-surface px-3 text-base"
              data-testid="fix-date"
            />
          </label>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={confirming}
        title={t("fix.confirmTitle")}
        body={t("fix.confirmBody", { old: tx.amount.display, new: `Le ${toDisplay(newAmount)}` })}
        confirmLabel={t("fix.confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={submitFix}
        onCancel={() => setConfirming(false)}
      />

      <ConfirmDialog
        open={confirmingRemove}
        title={t("detail.removeTitle")}
        body={t("detail.removeBody", { amount: tx.amount.display })}
        confirmLabel={t("detail.remove")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => {
          void removeMutation
            .mutateAsync(tx.id)
            .then(() => {
              toast.show({ message: t("detail.removeDone") });
              closeAll();
            })
            .catch(() => {
              setConfirmingRemove(false);
              toast.show({ message: t("error.generic") });
            });
        }}
        onCancel={() => setConfirmingRemove(false)}
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
