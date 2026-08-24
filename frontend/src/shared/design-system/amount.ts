// Amount-entry logic for AmountKeypad — pure and unit-tested.
// This is INPUT formatting only (digit grouping for display while typing).
// It is not financial calculation: authoritative values/formatting come from the server.

export interface AmountState {
  whole: string; // digits, no leading zeros (except a single "0" when decimal in use)
  decimal: string | null; // null = no decimal point yet; "" = point typed, no digits
}

export const EMPTY_AMOUNT: AmountState = { whole: "", decimal: null };

const MAX_WHOLE_DIGITS = 9; // sanity cap: < Le 1,000,000,000

export function pressDigit(state: AmountState, digit: string): AmountState {
  if (!/^[0-9]$/.test(digit)) return state;
  if (state.decimal !== null) {
    if (state.decimal.length >= 2) return state; // max two decimal places
    return { ...state, whole: state.whole === "" ? "0" : state.whole, decimal: state.decimal + digit };
  }
  if (state.whole === "" && digit === "0") return state; // swallow leading zeros
  if (state.whole.length >= MAX_WHOLE_DIGITS) return state; // sanity cap
  return { ...state, whole: state.whole + digit };
}

export function pressDecimal(state: AmountState): AmountState {
  if (state.decimal !== null) return state; // only one decimal point
  return { whole: state.whole === "" ? "0" : state.whole, decimal: "" };
}

export function backspace(state: AmountState): AmountState {
  if (state.decimal !== null) {
    if (state.decimal.length > 0) return { ...state, decimal: state.decimal.slice(0, -1) };
    return { ...state, decimal: null };
  }
  return { ...state, whole: state.whole.slice(0, -1) };
}

export function clear(): AmountState {
  return EMPTY_AMOUNT;
}

export function isEmpty(state: AmountState): boolean {
  return toMinor(state) === 0;
}

export function atCap(state: AmountState): boolean {
  return state.decimal === null && state.whole.length >= MAX_WHOLE_DIGITS;
}

/** Build an AmountState from server minor units — for pre-filled edits (input state, not calculation). */
export function fromMinor(minor: number): AmountState {
  const whole = Math.trunc(minor / 100);
  const cents = minor % 100;
  return {
    whole: whole === 0 ? (cents > 0 ? "0" : "") : String(whole),
    decimal: cents > 0 ? String(cents).padStart(2, "0") : null,
  };
}

export function toMinor(state: AmountState): number {
  const whole = state.whole === "" ? 0 : parseInt(state.whole, 10);
  const cents = state.decimal ? parseInt(state.decimal.padEnd(2, "0"), 10) : 0;
  return whole * 100 + cents;
}

/** Live display while typing, e.g. "1,500" / "1,500.5" / "0." — grouping only. */
export function toDisplay(state: AmountState): string {
  const whole = state.whole === "" ? "0" : state.whole;
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (state.decimal === null) return grouped;
  return `${grouped}.${state.decimal}`;
}
