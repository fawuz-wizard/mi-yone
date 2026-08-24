// Milestone 2 E2E: credit sale, debt payment, keyboard/focus, axe accessibility.
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Get started" }).click();
  await page.getByTestId("signin-identifier").fill("mariama@example.sl");
  await page.getByTestId("signin-password").fill("demo-password");
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("business-name")).toHaveText("Mariama's Provisions");
}

async function typeAmount(page: Page, digits: string) {
  for (const d of digits) await page.getByRole("button", { name: d, exact: true }).click();
}

test("credit sale: Owes you → customer → save → appears under Owed to you", async ({ page }) => {
  await signIn(page);
  await page.getByTestId("fab-add").click();
  await page.getByTestId("choose-money-in").click();
  await typeAmount(page, "62000");
  await page.getByTestId("payment-owes").click();
  await page.getByRole("radio", { name: /Isatu/ }).click();
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("toast")).toContainText("Isatu owes you Le 62,000");

  await page.getByRole("link", { name: "Money" }).click();
  await page.getByRole("tab", { name: "Owed to you" }).click();
  await expect(page.getByTestId("debt-card").filter({ hasText: "Isatu" })).toContainText("Le 62,000");
});

test("mark as paid: partial payment updates outstanding and records money in", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Money" }).click();
  await page.getByRole("tab", { name: "Owed to you" }).click();
  await page.getByTestId("debt-card").filter({ hasText: "Foday" }).click();
  await page.getByTestId("debt-pay").click();
  // Pre-filled with the full outstanding (Le 45,000): clear to a partial 20,000.
  const backspace = page.getByRole("button", { name: "Delete last digit" });
  for (let i = 0; i < 7; i += 1) await backspace.click();
  await typeAmount(page, "20000");
  await page.getByTestId("debt-pay-save").click();
  await expect(page.getByTestId("toast")).toContainText("Foday's debt: Le 25,000 remaining");

  await page.getByRole("tab", { name: "In", exact: true }).click();
  await expect(page.getByTestId("record-card").filter({ hasText: "Payment from Foday" })).toContainText("Le 20,000");
});

test("overpayment is rejected with a calm error", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Money" }).click();
  await page.getByRole("tab", { name: "Owed to you" }).click();
  await page.getByTestId("debt-card").first().click();
  await page.getByTestId("debt-pay").click();
  await typeAmount(page, "9"); // appended to prefill → guaranteed overpayment
  await page.getByTestId("debt-pay-save").click();
  await expect(page.getByRole("alert").filter({ hasText: "more than what is owed" })).toBeVisible();
});

test("keyboard: sheet closes on Escape and restores focus to the FAB", async ({ page }) => {
  await signIn(page);
  await page.getByTestId("fab-add").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("fab-add")).toBeFocused();
});

test("axe: welcome, home, and money have no serious/critical violations", async ({ page }) => {
  await page.goto("/welcome");
  for (const step of ["welcome", "home", "money"]) {
    if (step === "home") await signIn(page);
    if (step === "money") await page.getByRole("link", { name: "Money" }).click();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, `${step}: ${serious.map((v) => v.id).join(", ")}`).toHaveLength(0);
  }
});
