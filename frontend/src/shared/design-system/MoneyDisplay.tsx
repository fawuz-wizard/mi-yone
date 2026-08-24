// MoneyDisplay (Phase 5 §10) — the single rendering mechanism for monetary values.
// Renders the SERVER display string verbatim. Direction color appears only with its
// sign glyph (color is never the only signal — Phase 4 §6 law).
import type { Money } from "@/shared/api/types";

type Variant = "hero" | "row" | "inline";
type Direction = "in" | "out" | "neutral";

const variantClass: Record<Variant, string> = {
  hero: "text-[34px] leading-10 font-bold",
  row: "text-base font-semibold",
  inline: "font-semibold",
};

export function MoneyDisplay({
  money,
  variant = "row",
  direction = "neutral",
}: {
  money: Money;
  variant?: Variant;
  direction?: Direction;
}) {
  const sign = direction === "in" ? "+" : direction === "out" ? "−" : null;
  const color =
    direction === "in" ? "text-money-in" : direction === "out" ? "text-money-out" : "text-text-primary";
  const label =
    sign === "+" ? `plus ${money.display}` : sign === "−" ? `minus ${money.display}` : money.display;
  return (
    <span className={`money whitespace-nowrap ${variantClass[variant]} ${color}`} aria-label={label}>
      {sign ? <span aria-hidden>{sign} </span> : null}
      <span aria-hidden>{money.display}</span>
    </span>
  );
}
