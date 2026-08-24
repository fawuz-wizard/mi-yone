"use client";
// AmountKeypad (Phase 5 §11) — the core input primitive. Never depends on the OS
// numeric keyboard. 3×4 grid, ≥64dp keys, live display, backspace, long-press clear,
// one decimal (max 2dp), leading-zero handling, sanity cap, SR labels, desktop keys.
import { useCallback, useEffect, useRef, useState } from "react";
import { Delete } from "lucide-react";
import { useT } from "@/shared/i18n";
import {
  type AmountState,
  atCap,
  backspace,
  clear,
  pressDecimal,
  pressDigit,
  toDisplay,
} from "./amount";

export function AmountKeypad({
  value,
  onChange,
}: {
  value: AmountState;
  onChange: (next: AmountState) => void;
}) {
  const t = useT();
  const [capHint, setCapHint] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDigit = useCallback(
    (d: string) => {
      if (atCap(value) && value.decimal === null) {
        setCapHint(true);
        setTimeout(() => setCapHint(false), 1200);
        return;
      }
      onChange(pressDigit(value, d));
    },
    [value, onChange],
  );

  // Physical keyboard support (desktop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) handleDigit(e.key);
      else if (e.key === "." || e.key === ",") onChange(pressDecimal(value));
      else if (e.key === "Backspace") onChange(backspace(value));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [value, onChange, handleDigit]);

  const keyClass =
    "min-h-[64px] rounded-input bg-surface text-2xl font-semibold text-text-primary " +
    "active:bg-brand-tint transition-colors duration-fast";

  return (
    <div>
      <div
        role="textbox"
        aria-readonly
        aria-label={t("keypad.amountLabel")}
        aria-live="polite"
        className={`money mb-4 text-center text-[40px] font-bold leading-tight ${
          toDisplay(value) === "0" ? "text-text-disabled" : "text-text-primary"
        } ${capHint ? "text-warning" : ""}`}
        data-testid="amount-display"
      >
        <span className="mr-1 align-middle text-xl font-semibold text-text-secondary">Le</span>
        {toDisplay(value)}
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-card bg-sunken p-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className={keyClass} onClick={() => handleDigit(d)}>
            {d}
          </button>
        ))}
        <button
          type="button"
          className={keyClass}
          aria-label={t("keypad.decimal")}
          onClick={() => onChange(pressDecimal(value))}
        >
          .
        </button>
        <button type="button" className={keyClass} onClick={() => handleDigit("0")}>
          0
        </button>
        <button
          type="button"
          className={`${keyClass} flex items-center justify-center`}
          aria-label={t("keypad.backspace")}
          onClick={() => onChange(backspace(value))}
          onPointerDown={() => {
            holdTimer.current = setTimeout(() => onChange(clear()), 600); // long-press clear
          }}
          onPointerUp={() => holdTimer.current && clearTimeout(holdTimer.current)}
          onPointerLeave={() => holdTimer.current && clearTimeout(holdTimer.current)}
        >
          <Delete aria-hidden size={24} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
