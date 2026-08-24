import { describe, expect, it } from "vitest";
import {
  EMPTY_AMOUNT,
  backspace,
  clear,
  isEmpty,
  pressDecimal,
  pressDigit,
  toDisplay,
  toMinor,
} from "./amount";

function type(s: string) {
  let state = EMPTY_AMOUNT;
  for (const ch of s) {
    state = ch === "." ? pressDecimal(state) : pressDigit(state, ch);
  }
  return state;
}

describe("amount entry (AmountKeypad logic)", () => {
  it("groups digits for display", () => {
    expect(toDisplay(type("45000"))).toBe("45,000");
    expect(toDisplay(type("1500000"))).toBe("1,500,000");
  });

  it("swallows leading zeros", () => {
    expect(toDisplay(type("00045"))).toBe("45");
  });

  it("converts to integer minor units (SLE exponent 2)", () => {
    expect(toMinor(type("45000"))).toBe(4_500_000);
    expect(toMinor(type("1500.5"))).toBe(150_050);
    expect(toMinor(type("0.05"))).toBe(5);
  });

  it("allows only one decimal point and max two decimal places", () => {
    expect(toDisplay(type("1.2.3"))).toBe("1.23");
    expect(toDisplay(type("1.234"))).toBe("1.23");
  });

  it("shows '0.' state when decimal pressed first", () => {
    expect(toDisplay(type("."))).toBe("0.");
    expect(toMinor(type(".5"))).toBe(50);
  });

  it("enforces the sanity cap of 9 whole digits", () => {
    expect(toDisplay(type("12345678901"))).toBe("123,456,789");
  });

  it("backspaces through decimals, point, then whole digits", () => {
    let s = type("12.34");
    s = backspace(s); // 12.3
    expect(toDisplay(s)).toBe("12.3");
    s = backspace(s); // 12.
    s = backspace(s); // 12 (point removed)
    expect(toDisplay(s)).toBe("12");
    s = backspace(s);
    expect(toDisplay(s)).toBe("1");
  });

  it("clears to empty", () => {
    expect(isEmpty(clear())).toBe(true);
    expect(toDisplay(clear())).toBe("0");
  });
});
