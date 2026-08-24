"use client";
// The Capture Engine (Phase 5 §19–22). ONE capture system for every money moment.
// Slice scope: Sale (Money in) and Expense (Money out); further contexts plug into
// the contextual slot without new architecture.
import { useCallback, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { BottomSheet } from "@/shared/design-system/BottomSheet";
import { AmountKeypad } from "@/shared/design-system/AmountKeypad";
import { Button } from "@/shared/design-system/Button";
import { ConfirmDialog } from "@/shared/design-system/ConfirmDialog";
import { useToast } from "@/shared/design-system/Toast";
import { EMPTY_AMOUNT, isEmpty, toMinor, type AmountState } from "@/shared/design-system/amount";
import { isDomainError } from "@/shared/api/client";
import { captureQueue } from "@/shared/capture-queue";
import { useT } from "@/shared/i18n";
import { useCreateTransaction, useUndoTransaction } from "./api";
import {
  beginSubmit,
  closeCapture,
  openCapture,
  submitFailedNetwork,
  submitFailedServer,
  submitSucceeded,
  type CaptureKind,
  type CaptureState,
} from "./machine";

export function useCaptureController() {
  const [state, setState] = useState<CaptureState>({ name: "IDLE" });
  const open = useCallback((kind: CaptureKind) => setState(openCapture(kind)), []);
  const close = useCallback(() => setState(closeCapture()), []);
  return { state, setState, open, close };
}

export function CaptureSheet({
  state,
  setState,
  onClose,
}: {
  state: CaptureState;
  setState: (s: CaptureState) => void;
  onClose: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const create = useCreateTransaction();
  const undo = useUndoTransaction();
  const [amount, setAmount] = useState<AmountState>(EMPTY_AMOUNT);
  const [note, setNote] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const activeKind = state.name === "IDLE" ? null : state.kind;
  const isOpen = state.name !== "IDLE" && state.name !== "SUCCESS";
  const dirty = !isEmpty(amount);

  const reset = useCallback(() => {
    setAmount(EMPTY_AMOUNT);
    setNote("");
    setConfirmDiscard(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const submit = useCallback(async () => {
    if (state.name !== "EDITING" && state.name !== "OPEN" && state.name !== "SERVER_ERROR") return;
    if (isEmpty(amount)) return;
    const kind = state.kind;
    const idempotencyKey = state.idempotencyKey;
    const amountMinor = toMinor(amount);
    const editing: CaptureState = { name: "EDITING", kind, idempotencyKey };
    setState(beginSubmit(editing));
    const input = {
      type: kind === "sale" ? ("INCOME" as const) : ("EXPENSE" as const),
      amount_minor: amountMinor,
      description: note || undefined,
      source: kind === "sale" ? ("SALE" as const) : ("MANUAL" as const),
    };
    try {
      const tx = await create.mutateAsync({ input, idempotencyKey });
      setState(submitSucceeded({ name: "SUBMITTING", kind, idempotencyKey }));
      toast.show({
        message: t("capture.savedToast", { amount: tx.amount.display }),
        undo: () => void undo.mutateAsync(tx.id),
      });
      handleClose();
    } catch (e) {
      if (isDomainError(e) && e.kind === "network") {
        // OFFLINE_PENDING: hand the capture to the queue (same idempotency key → one record ever).
        setState(submitFailedNetwork({ name: "SUBMITTING", kind, idempotencyKey }));
        const label = `${t(kind === "sale" ? "capture.sale" : "capture.expense")}`;
        captureQueue.enqueue({
          idempotencyKey,
          label,
          submittedAt: Date.now(),
          state: "pending",
          retry: async () => {
            captureQueue.setState(idempotencyKey, "saving");
            try {
              await create.mutateAsync({ input, idempotencyKey });
              captureQueue.resolve(idempotencyKey);
            } catch (err) {
              captureQueue.setState(
                idempotencyKey,
                isDomainError(err) && err.kind === "network" ? "pending" : "failed",
              );
              throw err;
            }
          },
        });
        toast.show({ message: t("capture.pendingToast"), tone: "pending" });
        handleClose();
      } else {
        setState(submitFailedServer({ name: "SUBMITTING", kind, idempotencyKey }, "capture.saveFailed"));
      }
    }
  }, [state, amount, note, create, undo, toast, t, setState, handleClose]);

  if (!activeKind || !isOpen) return null;

  return (
    <>
      <BottomSheet
        open
        title={t(activeKind === "sale" ? "capture.titleSale" : "capture.titleExpense")}
        onClose={handleClose}
        dirty={dirty}
        onConfirmDiscard={() => {
          setConfirmDiscard(true);
          return false;
        }}
        footer={
          <Button
            fullWidth
            onClick={() => void submit()}
            loading={state.name === "SUBMITTING"}
            loadingLabel={t("common.save")}
            data-testid="capture-save"
          >
            {t("common.save")}
          </Button>
        }
      >
        <div className="pb-4">
          {state.name === "SERVER_ERROR" ? (
            <div role="alert" className="mb-3 rounded-card bg-danger-fill p-3 text-sm font-medium text-danger">
              {t(state.messageId)}
            </div>
          ) : null}
          <AmountKeypad
            value={amount}
            onChange={(next) => {
              setAmount(next);
              if (state.name === "OPEN") setState({ ...state, name: "EDITING" });
            }}
          />
          <label className="mt-4 block">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
              {t("capture.whatFor")}
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 min-h-[48px] w-full rounded-input border border-border-input bg-surface px-3 text-base"
            />
          </label>
        </div>
      </BottomSheet>
      <ConfirmDialog
        open={confirmDiscard}
        title={t("capture.discardTitle")}
        body={t("capture.discardBody")}
        confirmLabel={t("common.discard")}
        cancelLabel={t("common.keepEditing")}
        destructive
        onConfirm={() => {
          setConfirmDiscard(false);
          handleClose();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </>
  );
}

export function CaptureChooser({
  open,
  onChoose,
  onClose,
}: {
  open: boolean;
  onChoose: (kind: CaptureKind) => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <BottomSheet open={open} title={t("nav.add")} onClose={onClose}>
      <div className="grid gap-2 pb-4">
        <button
          data-testid="choose-money-in"
          onClick={() => onChoose("sale")}
          className="flex min-h-[64px] items-center gap-3 rounded-card bg-money-in-tint px-4 text-left active:opacity-90"
        >
          <ArrowDownToLine aria-hidden className="text-money-in" size={24} strokeWidth={2} />
          <span>
            <span className="block text-base font-semibold">{t("capture.moneyIn")}</span>
            <span className="block text-sm text-text-secondary">{t("capture.sale")}</span>
          </span>
        </button>
        <button
          data-testid="choose-money-out"
          onClick={() => onChoose("expense")}
          className="flex min-h-[64px] items-center gap-3 rounded-card bg-sunken px-4 text-left active:opacity-90"
        >
          <ArrowUpFromLine aria-hidden className="text-text-primary" size={24} strokeWidth={2} />
          <span>
            <span className="block text-base font-semibold">{t("capture.moneyOut")}</span>
            <span className="block text-sm text-text-secondary">{t("capture.expense")}</span>
          </span>
        </button>
      </div>
    </BottomSheet>
  );
}
