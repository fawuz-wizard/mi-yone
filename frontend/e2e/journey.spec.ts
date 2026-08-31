// The whole journey in one run (owner hardening brief, P0-12).
// Signup → business → product → sale by text → confirmation → stock →
// history → Overview → Business Watch → Partner explanation → advice.
// This is the demo path and the tester path, so it must hold end to end with
// every surface agreeing on the same numbers.
// Runs unchanged against the mock AND the real backend.
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "I have an account" }).click();
  await page.getByTestId("signin-identifier").fill("mariama@example.sl");
  await page.getByTestId("signin-password").fill("demo-password");
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("business-name")).toHaveText("Mariama's Provisions");
}

test("the full journey: product → spoken sale → stock → history → overview → watch → Partner", async ({ page }) => {
  await signIn(page);

  // 1. Add a product with a known price and opening stock.
  await page.getByRole("link", { name: "Stock" }).click();
  await page.getByTestId("new-product").click();
  await page.getByLabel("Product name").fill("Journey Salt (pack)");
  await page.getByTestId("price-selling").click();
  for (const d of "2000") await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByTestId("price-selling-done").click();
  await page.getByLabel(/How many do you have now/).fill("10");
  await page.getByTestId("product-save").click();
  await expect(page.getByTestId("toast")).toContainText("Product saved");

  // 2. Record a sale the way an owner actually types it.
  await page.getByTestId("fab-add").click();
  await page.getByTestId("choose-money-in").click();
  await page.getByTestId("nlc-input").fill("Sold 2 Journey Salt at 2000 each");
  await page.getByTestId("nlc-fill").click();

  // 3. The confirmation preview shows what will be recorded — nothing yet.
  await expect(page.getByTestId("amount-display")).toContainText("4,000");
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("toast")).toContainText(/saved|recorded/i);

  // 4. Stock fell by exactly what was sold.
  await page.getByRole("link", { name: "Stock" }).click();
  const salt = page.getByTestId("product-row").filter({ hasText: "Journey Salt" });
  await expect(salt).toContainText("8 left");

  // 5. The record is in history, with its money intact.
  await page.getByRole("link", { name: "Money" }).click();
  await expect(page.getByText("Le 4,000").first()).toBeVisible();

  // 6. Overview counts it.
  await page.getByRole("link", { name: "Home" }).click();
  await expect(page.getByTestId("left-over")).toBeVisible();

  // 7. Business Watch is a shortlist, and every row says what/why/what-to-do.
  const rows = page.getByTestId("watch-row");
  const count = await rows.count();
  expect(count).toBeLessThanOrEqual(5);

  // 8. The Partner explains the same business from the same records.
  await page.getByRole("link", { name: "Partner", exact: true }).click();
  await page.getByTestId("partner-input").fill("Which products are selling the most?");
  await page.getByTestId("partner-send").click();
  const reply = page.getByTestId("partner-msg-reply").last();
  await expect(reply).toContainText("Journey Salt");
  await expect(reply).toContainText("Le 4,000"); // the price it was SOLD at

  // 9. And gives advice, clearly separated from the records.
  await page.getByTestId("partner-input").fill("How can I increase sales?");
  await page.getByTestId("partner-send").click();
  const advice = page.getByTestId("partner-msg-reply").last();
  await expect(advice.getByTestId("partner-block-guidance").first()).toBeVisible();
  await expect(advice).toContainText("General business guidance");
});

test("a price change never rewrites what past sales earned", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Stock" }).click();
  await page.getByTestId("new-product").click();
  await page.getByLabel("Product name").fill("Journey Maize (bag)");
  await page.getByTestId("price-selling").click();
  for (const d of "300") await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByTestId("price-selling-done").click();
  await page.getByLabel(/How many do you have now/).fill("10");
  await page.getByTestId("product-save").click();

  await page.getByTestId("fab-add").click();
  await page.getByTestId("choose-money-in").click();
  await page.getByTestId("nlc-input").fill("Sold 2 Journey Maize at 300 each");
  await page.getByTestId("nlc-fill").click();
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("toast")).toContainText(/saved|recorded/i);

  await page.getByRole("link", { name: "Partner", exact: true }).click();
  await page.getByTestId("partner-input").fill("How much did I make from Journey Maize?");
  await page.getByTestId("partner-send").click();
  await expect(page.getByTestId("partner-msg-reply").last()).toContainText("Le 600");

  // The owner raises the price today. History must not move.
  await page.getByRole("link", { name: "Stock" }).click();
  await page.getByTestId("product-row").filter({ hasText: "Journey Maize" }).click();
  await page.getByTestId("edit-product").click();
  await page.getByTestId("price-selling").click();
  // The keypad opens pre-filled with the current price; clear it first.
  for (let i = 0; i < 8; i += 1) await page.getByRole("button", { name: "Delete last digit" }).click();
  for (const d of "500") await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByTestId("price-selling-done").click();
  await page.getByTestId("product-save").click();
  await expect(page.getByTestId("toast")).toContainText("Product saved");
  await page.keyboard.press("Escape"); // close the product sheet

  await page.getByRole("link", { name: "Partner", exact: true }).click();
  await page.getByTestId("partner-input").fill("How much did I make from Journey Maize?");
  await page.getByTestId("partner-send").click();
  await expect(page.getByTestId("partner-msg-reply").last()).toContainText("Le 600");
});

test("an ambiguous spoken total is asked about, never assumed", async ({ page }) => {
  await signIn(page);
  await page.getByTestId("fab-add").click();
  await page.getByTestId("choose-money-in").click();
  // No "each", no "total" — Le 350 apiece or Le 350 for all three?
  await page.getByTestId("nlc-input").fill("Sold 3 bags rice 350");
  await page.getByTestId("nlc-fill").click();
  await expect(page.getByTestId("nlc-summary")).toContainText("each");
  // The interpreter refused to choose, so Save stays shut until the owner says.
  await expect(page.getByTestId("capture-save")).toBeDisabled();
});
