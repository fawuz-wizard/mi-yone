import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { AmountKeypad } from "./AmountKeypad";
import { EMPTY_AMOUNT, type AmountState } from "./amount";
import { I18nProvider } from "@/shared/i18n";

function Harness() {
  const [value, setValue] = useState<AmountState>(EMPTY_AMOUNT);
  return (
    <I18nProvider>
      <AmountKeypad value={value} onChange={setValue} />
    </I18nProvider>
  );
}

describe("AmountKeypad (Phase 5 §11)", () => {
  it("types digits and formats the live display with grouping", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    for (const d of ["4", "5", "0", "0", "0"]) {
      await user.click(screen.getByRole("button", { name: d }));
    }
    expect(screen.getByTestId("amount-display")).toHaveTextContent("45,000");
  });

  it("backspaces the last digit", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "7" }));
    await user.click(screen.getByRole("button", { name: "8" }));
    await user.click(screen.getByRole("button", { name: "Delete last digit" }));
    expect(screen.getByTestId("amount-display")).toHaveTextContent(/7$/);
  });

  it("exposes the amount as a labeled textbox for screen readers", () => {
    render(<Harness />);
    expect(screen.getByRole("textbox", { name: "Amount in Leones" })).toBeInTheDocument();
  });
});
