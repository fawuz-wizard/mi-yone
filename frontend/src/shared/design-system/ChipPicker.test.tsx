import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChipPicker } from "./ChipPicker";
import { I18nProvider } from "@/shared/i18n";

const options = [
  { id: "a", label: "Rice (50kg bag)" },
  { id: "b", label: "Cooking oil (5L)" },
  { id: "c", label: "Sugar (1kg)" },
];

describe("ChipPicker (Phase 4 §13)", () => {
  it("renders chips as an accessible radiogroup and selects on tap", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <I18nProvider>
        <ChipPicker label="What was sold?" options={options} selectedId={null} onSelect={onSelect} />
      </I18nProvider>,
    );
    expect(screen.getByRole("radiogroup", { name: "What was sold?" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Rice/ }));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("marks the selected chip with aria-checked and allows deselect", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <I18nProvider>
        <ChipPicker label="What was sold?" options={options} selectedId="b" onSelect={onSelect} />
      </I18nProvider>,
    );
    const chip = screen.getByRole("radio", { name: /Cooking oil/ });
    expect(chip).toHaveAttribute("aria-checked", "true");
    await user.click(chip);
    expect(onSelect).toHaveBeenCalledWith(null); // tap selected chip = deselect
  });

  it("shows the More… door when options exceed the visible count", () => {
    render(
      <I18nProvider>
        <ChipPicker label="Pick" options={options} selectedId={null} onSelect={() => {}} visibleCount={2} />
      </I18nProvider>,
    );
    expect(screen.getByRole("button", { name: "More…" })).toBeInTheDocument();
  });
});
