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
  const className = `money whitespace-nowrap ${variantClass[variant]} ${color}`;
  if (!sign) return <span className={className}>{money.display}</span>;
  // Screen-reader text lives in an sr-only span (aria-label is prohibited on generic spans).
  return (
    <span className={className}>
      <span className="sr-only">{sign === "+" ? `plus ${money.display}` : `minus ${money.display}`}</span>
      <span aria-hidden>
        {sign} {money.display}
      </span>
    </span>
  );
}
