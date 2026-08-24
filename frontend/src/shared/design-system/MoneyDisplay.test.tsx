import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MoneyDisplay } from "./MoneyDisplay";
import type { Money } from "@/shared/api/types";

const money: Money = { amount_minor: 4_500_000, currency: "SLE", display: "Le 45,000" };

describe("MoneyDisplay (Phase 5 §10)", () => {
  it("renders the server display string verbatim", () => {
    render(<MoneyDisplay money={money} />);
    expect(screen.getByText("Le 45,000")).toBeInTheDocument();
  });

  it("shows direction color ONLY together with its sign glyph", () => {
    const { container } = render(<MoneyDisplay money={money} direction="in" />);
    expect(container.textContent).toContain("+");
    expect(container.querySelector(".text-money-in")).not.toBeNull();
  });

  it("neutral direction carries neither sign nor money-in color", () => {
    const { container } = render(<MoneyDisplay money={money} />);
    expect(container.textContent).not.toContain("+");
    expect(container.querySelector(".text-money-in")).toBeNull();
  });

  it("announces sign in the accessible label", () => {
    render(<MoneyDisplay money={money} direction="out" />);
    expect(screen.getByLabelText("minus Le 45,000")).toBeInTheDocument();
  });
});
