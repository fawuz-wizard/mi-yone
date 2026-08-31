"use client";
// The Capture Engine (Phase 5 §19–22). ONE capture system for every money moment:
// sale (paid / credit / partial), expense — and the same sheet pattern is reused by
// debt payments (features/money). Idempotency key generated at OPEN.
import { useCallback, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Minus, Plus, ScanLine } from "lucide-react";
import { BottomSheet } from "@/shared/design-system/BottomSheet";
import { AmountKeypad } from "@/shared/design-system/AmountKeypad";
import { Button } from "@/shared/design-system/Button";
import { ChipPicker } from "@/shared/design-system/ChipPicker";
import { ConfirmDialog } from "@/shared/design-system/ConfirmDialog";
import { useToast } from "@/shared/design-system/Toast";
import { EMPTY_AMOUNT, fromMinor, isEmpty, toMinor, type AmountState } from "@/shared/design-system/amount";
import { isDomainError } from "@/shared/api/client";
import { captureQueue } from "@/shared/capture-queue";
import { SCAN_ENABLED } from "@/shared/flags";
import { useT } from "@/shared/i18n";
import {
  useCategories,
  useCreateCustomer,
  useCreateSale,
  useCreateTransaction,
  useCustomers,
  useProducts,
  useRecentTransactions,
  useSuppliers,
  useUndoTransaction,
} from "./api";
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
import { QuickEntry } from "./QuickEntry";
import type { InterpretedSale } from "./interpret";

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
  const createTx = useCreateTransaction();
  const createSale = useCreateSale();
  const createCustomer = useCreateCustomer();
  const undo = useUndoTransaction();

  const isOpen = state.name !== "IDLE" && state.name !== "SUCCESS";
  // Quick entry can route to any record type, so reference data loads while
  // the sheet is open regardless of the current kind.
  const products = useProducts(isOpen);
  const customers = useCustomers(isOpen);
  const categories = useCategories("EXPENSE", isOpen);
  const suppliers = useSuppliers(isOpen);
  const recentTx = useRecentTransactions(isOpen);

  const [amount, setAmount] = useState<AmountState>(EMPTY_AMOUNT);
  const [note, setNote] = useState("");
  const [productId, setProductId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [payment, setPayment] = useState<"PAID" | "OWES">("PAID");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [dateStr, setDateStr] = useState(""); // "" = today (default; backdating optional)
  const [paidNow, setPaidNow] = useState<AmountState>(EMPTY_AMOUNT);
  // Provenance of THIS capture: manual form by default; a routed quick entry
  // stamps text/voice. Sent with the record, reset with the rest of the form.
  const [entryMethod, setEntryMethod] = useState<"manual" | "text" | "voice">("manual");
  const [paidNowOpen, setPaidNowOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // When a quick entry stated its own unit price, the quantity stepper keeps
  // using it (instead of silently reverting to the catalog price).
  const [unitOverrideMinor, setUnitOverrideMinor] = useState<number | null>(null);

  const dirty = !isEmpty(amount);
  const needsCustomer = state.name !== "IDLE" && state.kind === "sale" && payment === "OWES" && !customerId;

  const reset = useCallback(() => {
    setAmount(EMPTY_AMOUNT);
    setNote("");
    setProductId(null);
    setQuantity(1);
    setPayment("PAID");
    setCustomerId(null);
    setCategoryId(null);
    setDateStr("");
    setPaidNow(EMPTY_AMOUNT);
    setPaidNowOpen(false);
    setConfirmDiscard(false);
    setUnitOverrideMinor(null);
    setEntryMethod("manual");
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  // Selecting a product pre-fills the amount from its server price × quantity
  // (or the price stated in a quick entry, when there is one). This is input
  // assistance only — the server re-validates the submitted sale.
  function applyProduct(id: string | null, qty: number, overrideMinor: number | null = unitOverrideMinor) {
    setProductId(id);
    setQuantity(qty);
    const product = products.data?.find((p) => p.id === id);
    const unitMinor = overrideMinor ?? product?.selling_price.amount_minor;
    if (product && unitMinor) setAmount(fromMinor(unitMinor * qty));
  }

  // Apply an interpreted quick entry to the form. The filled form is the
  // confirmation preview — nothing is recorded until the owner presses Save.
  // A sale phrase typed in the expense sheet (or vice versa) switches the kind.
  function applyInterpreted(r: InterpretedSale) {
    if (state.name === "IDLE") return;
    setEntryMethod(r.origin ?? "text");
    setState({ name: "EDITING", kind: "sale", idempotencyKey: state.idempotencyKey });
    setAmount(r.totalMinor !== null ? fromMinor(r.totalMinor) : EMPTY_AMOUNT);
    setProductId(r.productId);
    setQuantity(r.quantity ?? 1);
    const derivedUnit =
      r.unitPriceMinor ??
      (r.totalMinor !== null && r.quantity && r.totalMinor % r.quantity === 0 ? r.totalMinor / r.quantity : null);
    setUnitOverrideMinor(derivedUnit);
    if (r.payment === "PAID") {
      setPayment("PAID");
      setPaidNow(EMPTY_AMOUNT);
    } else {
      setPayment("OWES");
      setPaidNow(r.paidNowMinor !== null ? fromMinor(r.paidNowMinor) : EMPTY_AMOUNT);
    }
    setCustomerId(r.customerId);
  }

  // Expense routed from the quick entry: switch the sheet to the expense form.
  function applyInterpretedExpense(r: InterpretedSale) {
    if (state.name === "IDLE") return;
    setEntryMethod(r.origin ?? "text");
    setState({ name: "EDITING", kind: "expense", idempotencyKey: state.idempotencyKey });
    setAmount(r.totalMinor !== null ? fromMinor(r.totalMinor) : EMPTY_AMOUNT);
    setCategoryId(r.categoryId);
    setNote(r.noteText ?? "");
  }

  // A quick-entry card (purchase / credit record) saved through an existing
  // endpoint: announce it and close, exactly like a normal capture.
  function quickRecorded(message: string) {
    toast.show({ message });
    handleClose();
  }

  const submit = useCallback(async () => {
    if (state.name !== "EDITING" && state.name !== "OPEN" && state.name !== "SERVER_ERROR") return;
    if (isEmpty(amount) || needsCustomer) return;
    const kind = state.kind;
    const idempotencyKey = state.idempotencyKey;
    const amountMinor = toMinor(amount);
    const paidNowMinor = toMinor(paidNow);
    setState(beginSubmit({ name: "EDITING", kind, idempotencyKey }));

    const customerName = customers.data?.find((c) => c.id === customerId)?.name ?? "";

    const perform = async () => {
      if (kind === "sale") {
        const input = {
          amount_minor: amountMinor,
          product_id: productId ?? undefined,
          quantity: productId ? quantity : undefined,
          payment: payment === "PAID" ? ("PAID" as const) : paidNowMinor > 0 ? ("PARTIAL" as const) : ("CREDIT" as const),
          amount_paid_minor: payment === "OWES" && paidNowMinor > 0 ? paidNowMinor : undefined,
          customer_id: payment === "OWES" ? (customerId ?? undefined) : undefined,
          description: note || undefined,
          entry_method: entryMethod,
        };
        return { kind: "sale" as const, result: await createSale.mutateAsync({ input, idempotencyKey }) };
      }
      const input = {
        type: "EXPENSE" as const,
        amount_minor: amountMinor,
        category_id: categoryId ?? undefined,
        description: note || undefined,
        occurred_at: dateStr ? `${dateStr}T12:00:00` : undefined,
        source: "MANUAL" as const,
        entry_method: entryMethod,
      };
      return { kind: "expense" as const, result: await createTx.mutateAsync({ input, idempotencyKey }) };
    };

    try {
      const outcome = await perform();
      setState(submitSucceeded({ name: "SUBMITTING", kind, idempotencyKey }));
      if (outcome.kind === "sale") {
        const { transaction, receivable, total } = outcome.result;
        if (receivable) {
          toast.show({
            message: t("capture.creditSavedToast", {
              amount: total.display,
              name: customerName,
              owed: receivable.outstanding.display,
            }),
          });
        } else if (transaction) {
          toast.show({
            message: t("capture.savedToast", { amount: transaction.amount.display }),
            undo: () => void undo.mutateAsync(transaction.id),
          });
        }
      } else {
        const tx = outcome.result;
        toast.show({
          message: t("capture.savedToast", { amount: tx.amount.display }),
          undo: () => void undo.mutateAsync(tx.id),
        });
      }
      handleClose();
    } catch (e) {
      if (isDomainError(e) && e.kind === "network") {
        setState(submitFailedNetwork({ name: "SUBMITTING", kind, idempotencyKey }));
        captureQueue.enqueue({
          idempotencyKey,
          label: t(kind === "sale" ? "capture.sale" : "capture.expense"),
          submittedAt: Date.now(),
          state: "pending",
          retry: async () => {
            captureQueue.setState(idempotencyKey, "saving");
            try {
              await perform();
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
  }, [state, amount, paidNow, note, productId, quantity, payment, customerId, categoryId, dateStr, needsCustomer, customers.data, createSale, createTx, undo, toast, t, setState, handleClose]);

  if (state.name === "IDLE" || !isOpen) return null;
  const kind = state.kind;

  return (
    <>
      <BottomSheet
        open
        title={t(kind === "sale" ? "capture.titleSale" : "capture.titleExpense")}
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
            disabled={isEmpty(amount) || needsCustomer}
            loading={state.name === "SUBMITTING"}
            loadingLabel={t("common.save")}
            data-testid="capture-save"
          >
            {t("common.save")}
          </Button>
        }
      >
        <div className="space-y-4 pb-4">
          {state.name === "SERVER_ERROR" ? (
            <div role="alert" className="rounded-card bg-danger-fill p-3 text-sm font-medium text-danger">
              {t(state.messageId)}
            </div>
          ) : null}

          {/* Quick entry (both kinds): type or speak → interpret → route. Sales
              and expenses fill the form below (the editable confirmation
              preview); purchases and credit records confirm inline. */}
          <QuickEntry
            products={products.data ?? []}
            customers={customers.data ?? []}
            suppliers={suppliers.data ?? []}
            categories={categories.data ?? []}
            recentTransactions={recentTx.data ?? []}
            onApplySale={applyInterpreted}
            onApplyExpense={applyInterpretedExpense}
            onRecorded={quickRecorded}
          />

          <AmountKeypad
            value={amount}
            onChange={(next) => {
              setAmount(next);
              if (state.name === "OPEN") setState({ ...state, name: "EDITING" });
            }}
          />

          {/* Contextual slot: product chips for sales (Phase 5 §19). */}
          {kind === "sale" && (products.data?.length ?? 0) > 0 ? (
            <div>
              <ChipPicker
                label={t("capture.product")}
                options={(products.data ?? []).map((p) => ({ id: p.id, label: p.name, sublabel: p.selling_price.display }))}
                selectedId={productId}
                onSelect={(id) => {
                  setUnitOverrideMinor(null); // manual pick returns to the catalog price
                  applyProduct(id, 1, null);
                }}
              />
              {productId ? (
                <div className="mt-2 flex items-center gap-3">
                  <span className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
                    {t("capture.quantity")}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="−"
                      onClick={() => applyProduct(productId, Math.max(1, quantity - 1))}
                      className="flex h-11 w-11 items-center justify-center rounded-input bg-sunken"
                    >
                      <Minus size={16} aria-hidden />
                    </button>
                    <span className="tabular w-8 text-center text-base font-semibold">{quantity}</span>
                    <button
                      type="button"
                      aria-label="+"
                      onClick={() => applyProduct(productId, quantity + 1)}
                      className="flex h-11 w-11 items-center justify-center rounded-input bg-sunken"
                    >
                      <Plus size={16} aria-hidden />
                    </button>
                  </div>
                </div>
              ) : null}
              {(() => {
                // Price-history hint (owner brief): when this product's RECENT
                // recorded prices differ from the price being used, say so —
                // suggest, never silently assume. The owner edits freely.
                const product = products.data?.find((p) => p.id === productId);
                const recents = product?.recent_prices ?? [];
                const effectiveUnit = unitOverrideMinor ?? product?.selling_price.amount_minor ?? null;
                const conflicting =
                  recents.length > 0 && (recents.length > 1 || (effectiveUnit !== null && recents[0].amount_minor !== effectiveUnit));
                if (!conflicting) return null;
                return (
                  <p className="mt-2 text-sm text-text-secondary" data-testid="recent-prices">
                    {t("capture.recentPrices", { list: recents.map((r) => r.display).join(" · ") })}
                  </p>
                );
              })()}
            </div>
          ) : null}

          {/* Paid / Owes you (Phase 5 §21) — default Paid, zero taps in the common case. */}
          {kind === "sale" ? (
            <div>
              <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
                {t("capture.paymentQuestion")}
              </p>
              <div role="radiogroup" aria-label={t("capture.paymentQuestion")} className="grid grid-cols-2 gap-2">
                <PaymentOption
                  icon={<ArrowDownToLine size={16} aria-hidden />}
                  label={t("capture.paid")}
                  selected={payment === "PAID"}
                  onSelect={() => setPayment("PAID")}
                  testId="payment-paid"
                />
                <PaymentOption
                  icon={<ArrowUpFromLine size={16} aria-hidden />}
                  label={t("capture.owesYou")}
                  selected={payment === "OWES"}
                  onSelect={() => setPayment("OWES")}
                  testId="payment-owes"
                />
              </div>
              {payment === "OWES" ? (
                <div className="mt-3 space-y-3">
                  <ChipPicker
                    label={t("capture.customerQuestion")}
                    options={(customers.data ?? []).map((c) => ({ id: c.id, label: c.name, sublabel: c.phone ?? undefined }))}
                    selectedId={customerId}
                    onSelect={setCustomerId}
                    onCreate={async (name) => {
                      const c = await createCustomer.mutateAsync(name);
                      return { id: c.id, label: c.name };
                    }}
                    createLabel={t("capture.addCustomer")}
                    createFieldLabel={t("capture.newCustomerName")}
                  />
                  <button
                    type="button"
                    onClick={() => setPaidNowOpen(true)}
                    className="money flex min-h-[44px] w-full items-center justify-between rounded-input border border-border-input bg-surface px-3 text-sm font-medium"
                  >
                    <span className="text-text-secondary">{t("capture.paidNow")}</span>
                    <span>{isEmpty(paidNow) ? "—" : `Le ${paidNowDisplay(paidNow)}`}</span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Category chips for expenses (seeded defaults, recent-first later). */}
          {kind === "expense" && (categories.data?.length ?? 0) > 0 ? (
            <ChipPicker
              label={t("capture.category")}
              options={(categories.data ?? []).map((c) => ({ id: c.id, label: c.name }))}
              selectedId={categoryId}
              onSelect={setCategoryId}
            />
          ) : null}

          <label className="block">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
              {t("capture.whatFor")}
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 min-h-[48px] w-full rounded-input border border-border-input bg-surface px-3 text-base"
            />
          </label>

          {/* Business date — defaults to today; backdating allowed, future dates are not. */}
          {kind === "expense" ? (
            <label className="block">
              <span className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
                {t("capture.when")} ({t("capture.today")})
              </span>
              <input
                type="date"
                value={dateStr}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDateStr(e.target.value)}
                className="mt-1 min-h-[48px] w-full rounded-input border border-border-input bg-surface px-3 text-base"
                data-testid="capture-date"
              />
            </label>
          ) : null}
        </div>
      </BottomSheet>

      {/* Partial "paid now" entry — same AmountKeypad, own small sheet (no OS keyboard). */}
      <BottomSheet open={paidNowOpen} title={t("capture.paidNow")} onClose={() => setPaidNowOpen(false)}
        footer={
          <Button fullWidth onClick={() => setPaidNowOpen(false)}>
            {t("common.save")}
          </Button>
        }
      >
        <div className="pb-4">
          <AmountKeypad value={paidNow} onChange={setPaidNow} />
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

function paidNowDisplay(state: AmountState): string {
  const whole = state.whole === "" ? "0" : state.whole;
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return state.decimal === null ? grouped : `${grouped}.${state.decimal}`;
}

function PaymentOption({
  icon,
  label,
  selected,
  onSelect,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onSelect: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      data-testid={testId}
      className={`flex min-h-[48px] items-center justify-center gap-2 rounded-input border text-sm font-semibold transition-colors duration-fast ${
        selected ? "border-brand bg-brand-tint text-brand" : "border-border bg-surface text-text-primary"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export function CaptureChooser({
  open,
  onChoose,
  onScan,
  onClose,
}: {
  open: boolean;
  onChoose: (kind: CaptureKind) => void;
  onScan?: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <BottomSheet open={open} title={t("nav.add")} onClose={onClose}>
      <div className="grid gap-2 pb-4">
        {onScan && SCAN_ENABLED ? (
          <button
            data-testid="choose-scan"
            onClick={onScan}
            className="flex min-h-[64px] items-center gap-3 rounded-card bg-brand-tint px-4 text-left active:opacity-90"
          >
            <ScanLine aria-hidden className="text-brand" size={24} strokeWidth={2} />
            <span>
              <span className="block text-base font-semibold">{t("scan.title")}</span>
              <span className="block text-sm text-text-secondary">{t("scan.chooserLabel")}</span>
            </span>
          </button>
        ) : onScan ? (
          /* Locked (owner decision): visible tease, honestly disabled. */
          <div
            data-testid="choose-scan-locked"
            aria-disabled
            className="flex min-h-[64px] items-center gap-3 rounded-card border border-border bg-surface px-4 text-left opacity-60"
          >
            <ScanLine aria-hidden className="text-text-secondary" size={24} strokeWidth={2} />
            <span>
              <span className="block text-base font-semibold">{t("scan.title")}</span>
              <span className="block text-sm text-text-secondary">{t("scan.comingSoon")}</span>
            </span>
          </div>
        ) : null}
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
