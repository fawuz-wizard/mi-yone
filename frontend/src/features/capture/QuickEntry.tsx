"use client";
// Quick entry — type or speak a business record in English, Krio, or a mix.
// The deterministic interpreter (interpret.ts) works out what it means, WHERE
// it belongs, and whether it looks right, then routes it:
//   sale     → fills the sale form (the form IS the confirmation preview)
//   expense  → switches this sheet to the expense form, pre-filled
//   purchase → inline editable card → EXISTING add-stock endpoint
//   owes you / you owe → inline card → EXISTING debt endpoints
//   ambiguous → asks (sale or purchase?) — it never guesses
// Issues come in two severities: blocking (must be resolved) and warnings
// (unusual but possibly intentional — the owner may confirm anyway).
// Nothing is saved from this file without the owner pressing a record button.
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, TriangleAlert } from "lucide-react";
import { useT } from "@/shared/i18n";
import { ChipPicker } from "@/shared/design-system/ChipPicker";
import { Button } from "@/shared/design-system/Button";
import { isDomainError } from "@/shared/api/client";
import type { Category, Customer, Product, Supplier, Transaction } from "@/shared/api/types";
import { interpretEntry, type EntryIntent, type InterpretedEntry, type InterpretIssue } from "./interpret";
import { useRecordDebt, useRecordPurchase } from "./api";

// --- Minimal Web Speech typings (lib.dom has none for the webkit prefix) -----
interface SpeechAlternativeLike { transcript: string }
interface SpeechResultLike { 0: SpeechAlternativeLike; isFinal: boolean }
interface SpeechEventLike { results: ArrayLike<SpeechResultLike>; resultIndex: number }
interface SpeechErrorLike { error?: string }
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: SpeechErrorLike) => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function speechCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const group = (n: string | number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export function QuickEntry({
  products,
  customers,
  suppliers,
  categories,
  recentTransactions,
  onApplySale,
  onApplyExpense,
  onRecorded,
}: {
  products: Product[];
  customers: Customer[];
  suppliers: Supplier[];
  categories: Category[];
  recentTransactions: Transaction[];
  onApplySale: (result: InterpretedEntry) => void;
  onApplyExpense: (result: InterpretedEntry) => void;
  onRecorded: (message: string) => void;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [result, setResult] = useState<InterpretedEntry | null>(null);
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  // Message id explaining what went wrong with the mic (null = nothing to say).
  const [micMessageId, setMicMessageId] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Detect support after mount only (SSR renders without the mic → no hydration mismatch).
  useEffect(() => {
    setMicSupported(speechCtor() !== null);
    return () => recognitionRef.current?.stop();
  }, []);

  const interpret = useCallback(
    (raw: string, forced?: EntryIntent) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      const r = interpretEntry(
        trimmed,
        {
          products,
          customers,
          suppliers,
          expenseCategories: categories,
          recentTransactions: recentTransactions.map((tx) => ({
            type: tx.type,
            amount_minor: tx.amount.amount_minor,
            occurred_at: tx.occurred_at,
          })),
        },
        forced,
      );
      setResult(r);
      setMicMessageId(null);
      if (!r.understood) return;
      if (r.intent === "sale") onApplySale(r);
      else if (r.intent === "expense") onApplyExpense(r);
      // purchase / receivable / payable / ambiguous render their own cards below
    },
    [products, customers, suppliers, categories, recentTransactions, onApplySale, onApplyExpense],
  );

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    const Ctor = speechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    // Krio has no speech-recognition locale; Sierra Leonean English is the
    // closest match and the interpreter is tolerant of Krio-flavoured words.
    rec.lang = "en-GB";
    rec.continuous = false;
    rec.interimResults = true;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      setText((finalText + interim).trim());
    };
    let errored = false;
    rec.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      const spoken = finalText.trim();
      if (spoken) interpret(spoken);
      else if (!errored) setMicMessageId("nlc.heardNothing");
    };
    // Say WHAT failed — a blocked mic, an unreachable speech service, and
    // silence are different problems with different fixes.
    rec.onerror = (e) => {
      errored = true;
      setListening(false);
      recognitionRef.current = null;
      const code = e?.error ?? "";
      if (code === "not-allowed" || code === "service-not-allowed") setMicMessageId("nlc.micDenied");
      else if (code === "network") setMicMessageId("nlc.micNetwork");
      else if (code === "audio-capture") setMicMessageId("nlc.micNoDevice");
      else if (code === "no-speech") setMicMessageId("nlc.heardNothing");
      else setMicMessageId("nlc.micError");
    };
    recognitionRef.current = rec;
    setMicMessageId(null);
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
      recognitionRef.current = null;
      setMicMessageId("nlc.micError");
    }
  }, [interpret]);

  const productName = (id: string | null) => products.find((p) => p.id === id)?.name ?? null;

  const issueText = (issue: InterpretIssue) =>
    t(`nlc.issue.${issue.id}`, {
      name: issue.params?.name ?? "",
      product: issue.params?.product ?? "",
      usual: group(issue.params?.usual ?? ""),
      entered: group(issue.params?.entered ?? ""),
      have: issue.params?.have ?? "",
      computed: group(issue.params?.computed ?? ""),
      stated: group(issue.params?.stated ?? ""),
    });

  const showSaleSummary =
    result?.understood && (result.intent === "sale" || result.intent === "expense") && (result.productId || result.quantity !== null);

  return (
    <div>
      <label className="block">
        <span className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
          {t("nlc.label")}
        </span>
        <div className="mt-1 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                interpret(text);
              }
            }}
            placeholder={t("nlc.placeholder")}
            data-testid="nlc-input"
            className="min-h-[48px] w-full min-w-0 flex-1 rounded-input border border-border-input bg-surface px-3 text-base placeholder:text-text-secondary"
          />
          {micSupported ? (
            <button
              type="button"
              onClick={listening ? stopListening : startListening}
              aria-label={t(listening ? "nlc.micStop" : "nlc.mic")}
              aria-pressed={listening}
              data-testid="nlc-mic"
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-input border transition-colors duration-fast ${
                listening ? "border-brand bg-brand-tint text-brand" : "border-border-input bg-surface text-text-primary"
              }`}
            >
              {listening ? <MicOff size={20} aria-hidden /> : <Mic size={20} aria-hidden />}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => interpret(text)}
            disabled={!text.trim() || listening}
            data-testid="nlc-fill"
            className="flex min-h-[48px] shrink-0 items-center rounded-input bg-sunken px-3 text-sm font-semibold disabled:opacity-40"
          >
            {t("nlc.fill")}
          </button>
        </div>
      </label>

      {listening ? (
        <p role="status" className="mt-2 text-sm font-medium text-brand">
          {t("nlc.listening")}
        </p>
      ) : null}
      {micMessageId ? (
        <p role="status" data-testid="nlc-mic-message" className="mt-2 text-sm font-medium text-text-secondary">
          {t(micMessageId)}
        </p>
      ) : null}

      {result ? (
        <div
          data-testid="nlc-summary"
          className={`mt-2 rounded-card p-3 text-sm ${result.issues.length > 0 ? "bg-warning-fill" : "bg-sunken"}`}
        >
          {showSaleSummary ? (
            <p className="font-semibold">
              {result.productId
                ? t("nlc.sumProduct", { qty: String(result.quantity ?? 1), product: productName(result.productId) ?? "" })
                : null}
              {result.unitPriceMinor !== null && result.unitPriceMinor % 100 === 0 ? (
                <span className="ml-1 font-normal text-text-secondary">
                  {t("nlc.sumEach", { price: group(result.unitPriceMinor / 100) })}
                </span>
              ) : null}
            </p>
          ) : null}

          {result.issues.length > 0 ? (
            <ul className="mt-1 space-y-1" role="alert">
              {result.issues.map((issue) => (
                <li key={issue.id} className="flex items-start gap-1.5">
                  <TriangleAlert
                    size={14}
                    aria-hidden
                    className={`mt-0.5 shrink-0 ${issue.severity === "block" ? "text-danger" : "text-warning"}`}
                  />
                  <span>{issueText(issue)}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {/* Ambiguous: ask — never guess. */}
          {result.understood && result.intent === null ? (
            <div className="mt-2">
              <p className="font-semibold">{t("nlc.intentQuestion")}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button level="secondary" onClick={() => interpret(text, "sale")} data-testid="nlc-intent-sale">
                  {t("nlc.intentSale")}
                </Button>
                <Button level="secondary" onClick={() => interpret(text, "purchase")} data-testid="nlc-intent-purchase">
                  {t("nlc.intentPurchase")}
                </Button>
              </div>
            </div>
          ) : null}

          {result.understood && result.intent === "purchase" ? (
            <PurchaseCard key={`${text}-purchase`} result={result} products={products} suppliers={suppliers} onRecorded={onRecorded} />
          ) : null}

          {result.understood && (result.intent === "receivable" || result.intent === "payable") ? (
            <DebtRecordCard
              key={`${text}-${result.intent}`}
              result={result}
              parties={result.intent === "receivable" ? customers : suppliers}
              onRecorded={onRecorded}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PURCHASE confirmation card — editable, records via the EXISTING add-stock
// endpoint (stock movement + expense/payable created server-side, atomically).
// ---------------------------------------------------------------------------
function PurchaseCard({
  result,
  products,
  suppliers,
  onRecorded,
}: {
  result: InterpretedEntry;
  products: Product[];
  suppliers: Supplier[];
  onRecorded: (message: string) => void;
}) {
  const t = useT();
  const record = useRecordPurchase();
  const [productId, setProductId] = useState<string | null>(result.productId);
  const [qtyStr, setQtyStr] = useState(result.quantity !== null ? String(result.quantity) : "");
  const [costStr, setCostStr] = useState(
    result.unitPriceMinor !== null && result.unitPriceMinor % 100 === 0 ? String(result.unitPriceMinor / 100) : "",
  );
  const [paid, setPaid] = useState(result.paidSupplier);
  const [supplierId, setSupplierId] = useState<string | null>(result.supplierId);
  const [errorId, setErrorId] = useState<string | null>(null);

  const qty = /^\d+$/.test(qtyStr) ? Number(qtyStr) : null;
  const costWhole = /^\d+(\.\d{1,2})?$/.test(costStr) ? Number(costStr) : null;
  const totalMinor = qty !== null && costWhole !== null ? Math.round(costWhole * 100) * qty : null;
  const canRecord = productId !== null && qty !== null && qty >= 1 && costWhole !== null && (paid || supplierId !== null);

  const submit = async () => {
    if (!canRecord || record.isPending || productId === null || qty === null || costWhole === null) return;
    setErrorId(null);
    try {
      await record.mutateAsync({
        productId,
        input: { quantity: qty, unit_cost_minor: Math.round(costWhole * 100), paid, supplier_id: paid ? undefined : (supplierId ?? undefined) },
      });
      const name = products.find((p) => p.id === productId)?.name ?? "";
      onRecorded(t("stock.addedToast", { qty: String(qty), name }));
    } catch (e) {
      setErrorId(isDomainError(e) ? e.messageId : "error.generic");
    }
  };

  return (
    <div className="mt-2 space-y-3 border-t border-border pt-3" data-testid="nlc-purchase-card">
      <p className="font-semibold">{t("nlc.purchaseDetected")}</p>
      {errorId ? (
        <p role="alert" className="rounded-card bg-danger-fill p-2 text-sm font-medium text-danger">
          {t(errorId)}
        </p>
      ) : null}
      <ChipPicker
        label={t("capture.product")}
        options={products.map((p) => ({ id: p.id, label: p.name, sublabel: p.cost_price.display }))}
        selectedId={productId}
        onSelect={setProductId}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">{t("stock.qty")}</span>
          <input
            inputMode="numeric"
            value={qtyStr}
            onChange={(e) => setQtyStr(e.target.value)}
            data-testid="nlc-purchase-qty"
            className="mt-1 min-h-[48px] w-full rounded-input border border-border-input bg-surface px-3 text-base"
          />
        </label>
        <label className="block">
          <span className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">{t("stock.unitCost")}</span>
          <input
            inputMode="decimal"
            value={costStr}
            onChange={(e) => setCostStr(e.target.value)}
            data-testid="nlc-purchase-cost"
            className="mt-1 min-h-[48px] w-full rounded-input border border-border-input bg-surface px-3 text-base"
          />
        </label>
      </div>
      <div>
        <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-text-secondary">{t("stock.paidQuestion")}</p>
        <div role="radiogroup" aria-label={t("stock.paidQuestion")} className="grid grid-cols-2 gap-2">
          <button
            type="button"
            role="radio"
            aria-checked={paid}
            onClick={() => setPaid(true)}
            className={`flex min-h-[48px] items-center justify-center rounded-input border text-sm font-semibold ${paid ? "border-brand bg-brand-tint text-brand" : "border-border bg-surface"}`}
          >
            {t("stock.paidNow")}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!paid}
            onClick={() => setPaid(false)}
            data-testid="nlc-purchase-owe"
            className={`flex min-h-[48px] items-center justify-center rounded-input border text-sm font-semibold ${!paid ? "border-brand bg-brand-tint text-brand" : "border-border bg-surface"}`}
          >
            {t("stock.oweSupplier")}
          </button>
        </div>
        {!paid ? (
          <div className="mt-2">
            <ChipPicker
              label={t("stock.whichSupplier")}
              options={suppliers.map((s) => ({ id: s.id, label: s.name }))}
              selectedId={supplierId}
              onSelect={setSupplierId}
            />
          </div>
        ) : null}
      </div>
      {totalMinor !== null ? (
        <p className="text-sm text-text-secondary">
          {t("nlc.totalLine", { total: group(totalMinor / 100) })} · {t("nlc.stockLine", { qty: String(qty) })}
        </p>
      ) : null}
      <Button fullWidth onClick={() => void submit()} disabled={!canRecord} loading={record.isPending} loadingLabel={t("nlc.recordPurchase")} data-testid="nlc-purchase-record">
        {t("nlc.recordPurchase")}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CREDIT RECORD card ("owes you" / "you owe") — records via the EXISTING
// manual debt endpoints.
// ---------------------------------------------------------------------------
function DebtRecordCard({
  result,
  parties,
  onRecorded,
}: {
  result: InterpretedEntry;
  parties: { id: string; name: string }[];
  onRecorded: (message: string) => void;
}) {
  const t = useT();
  const record = useRecordDebt();
  const kind = result.intent === "receivable" ? ("receivable" as const) : ("payable" as const);
  const preset = kind === "receivable" ? result.customerId : result.supplierId;
  const [partyId, setPartyId] = useState<string | null>(preset);
  const [errorId, setErrorId] = useState<string | null>(null);

  const amountMinor = result.totalMinor;
  const partyName = parties.find((p) => p.id === partyId)?.name ?? "";
  const canRecord = partyId !== null && amountMinor !== null;

  const submit = async () => {
    if (!canRecord || record.isPending || partyId === null || amountMinor === null) return;
    setErrorId(null);
    try {
      const debt = await record.mutateAsync({ kind, counterparty_id: partyId, amount_minor: amountMinor });
      onRecorded(t("parties.debtAdded", { amount: debt.outstanding.display }));
    } catch (e) {
      setErrorId(isDomainError(e) ? e.messageId : "error.generic");
    }
  };

  return (
    <div className="mt-2 space-y-3 border-t border-border pt-3" data-testid="nlc-debt-card">
      <p className="font-semibold">
        {t(kind === "receivable" ? "nlc.debtOwesYou" : "nlc.debtYouOwe", { name: partyName || "…" })}
        {amountMinor !== null && amountMinor % 100 === 0 ? (
          <span className="money ml-1">Le {group(amountMinor / 100)}</span>
        ) : null}
      </p>
      {errorId ? (
        <p role="alert" className="rounded-card bg-danger-fill p-2 text-sm font-medium text-danger">
          {t(errorId)}
        </p>
      ) : null}
      <ChipPicker
        label={t(kind === "receivable" ? "capture.customerQuestion" : "stock.whichSupplier")}
        options={parties.map((p) => ({ id: p.id, label: p.name }))}
        selectedId={partyId}
        onSelect={setPartyId}
      />
      <Button fullWidth onClick={() => void submit()} disabled={!canRecord} loading={record.isPending} loadingLabel={t("nlc.recordDebt")} data-testid="nlc-debt-record">
        {t("nlc.recordDebt")}
      </Button>
    </div>
  );
}
