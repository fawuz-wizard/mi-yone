"use client";
// Quick sale entry — type or speak a sale in English, Krio, or a mix, and the
// deterministic interpreter (interpret.ts) pre-fills the normal capture form.
// Flow: Type/Speak → Interpret → the filled form IS the confirmation preview →
// Save records through the existing sale path. Nothing is saved from here.
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, TriangleAlert } from "lucide-react";
import { useT } from "@/shared/i18n";
import type { Customer, Product } from "@/shared/api/types";
import { interpretSale, type InterpretedSale } from "./interpret";

// --- Minimal Web Speech typings (lib.dom has none for the webkit prefix) -----
interface SpeechAlternativeLike { transcript: string }
interface SpeechResultLike { 0: SpeechAlternativeLike; isFinal: boolean }
interface SpeechEventLike { results: ArrayLike<SpeechResultLike>; resultIndex: number }
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
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

export function QuickEntry({
  products,
  customers,
  onApply,
}: {
  products: Product[];
  customers: Customer[];
  onApply: (result: InterpretedSale) => void;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [result, setResult] = useState<InterpretedSale | null>(null);
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [heardNothing, setHeardNothing] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Detect support after mount only (SSR renders without the mic → no hydration mismatch).
  useEffect(() => {
    setMicSupported(speechCtor() !== null);
    return () => recognitionRef.current?.stop();
  }, []);

  const interpret = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      const r = interpretSale(trimmed, products, customers);
      setResult(r);
      setHeardNothing(false);
      if (r.understood) onApply(r);
    },
    [products, customers, onApply],
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
    rec.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      const spoken = finalText.trim();
      if (spoken) interpret(spoken);
      else setHeardNothing(true);
    };
    rec.onerror = () => {
      setListening(false);
      recognitionRef.current = null;
      setHeardNothing(true);
    };
    recognitionRef.current = rec;
    setHeardNothing(false);
    setListening(true);
    rec.start();
  }, [interpret]);

  const productName = (id: string | null) => products.find((p) => p.id === id)?.name ?? null;
  const group = (n: string) => n.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

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
      {heardNothing ? (
        <p role="status" className="mt-2 text-sm font-medium text-text-secondary">
          {t("nlc.heardNothing")}
        </p>
      ) : null}

      {result ? (
        <div
          data-testid="nlc-summary"
          className={`mt-2 rounded-card p-3 text-sm ${
            result.issues.length > 0 ? "bg-warning-fill" : "bg-sunken"
          }`}
        >
          {result.understood && (result.productId || result.quantity !== null) ? (
            <p className="font-semibold">
              {result.productId
                ? t("nlc.sumProduct", { qty: String(result.quantity ?? 1), product: productName(result.productId) ?? "" })
                : null}
              {result.unitPriceMinor !== null && result.unitPriceMinor % 100 === 0 ? (
                <span className="ml-1 font-normal text-text-secondary">
                  {t("nlc.sumEach", { price: group(String(result.unitPriceMinor / 100)) })}
                </span>
              ) : null}
            </p>
          ) : null}
          {result.issues.length > 0 ? (
            <ul className="mt-1 space-y-1" role="alert">
              {result.issues.map((issue) => (
                <li key={issue.id} className="flex items-start gap-1.5">
                  <TriangleAlert size={14} aria-hidden className="mt-0.5 shrink-0 text-warning" />
                  <span>
                    {t(`nlc.issue.${issue.id}`, {
                      name: issue.params?.name ?? "",
                      computed: group(issue.params?.computed ?? ""),
                      stated: group(issue.params?.stated ?? ""),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
