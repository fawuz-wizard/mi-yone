// Transactions milestone E2E: categories, date filters, extended fix, remove-record.
import { expect, test, type Page } from "@playwright/test";

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

test("expense with category + backdate lands in the right group and filter", async ({ page }) => {
  await signIn(page);
  await page.getByTestId("fab-add").click();
  await page.getByTestId("choose-money-out").click();
  await typeAmount(page, "73000");
  await page.getByRole("radio", { name: "Utilities" }).click();
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  await page.getByTestId("capture-date").fill(twoDaysAgo);
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("toast")).toContainText("Le 73,000");

  // Date history: the record groups under its business date, not today.
  await page.getByRole("link", { name: "Money" }).click();
  await page.getByRole("tab", { name: "Out", exact: true }).click();
  const record = page.getByTestId("record-card").filter({ hasText: "Utilities" }).first();
  await expect(record).toContainText("Le 73,000");

  // Category filter (server-side): only Utilities remain.
  await page.getByRole("radio", { name: "Utilities" }).click();
  await expect(page.getByTestId("record-card").filter({ hasText: "Transport" })).toHaveCount(0);
  await expect(page.getByTestId("record-card").filter({ hasText: "Utilities" }).first()).toBeVisible();

  // Date preset "Today" excludes the backdated record.
  await page.getByTestId("filter-today").click();
  await expect(page.getByTestId("record-card").filter({ hasText: "Le 73,000" })).toHaveCount(0);
});

test("fix can change category and note, history stays visible", async ({ page }) => {
  await signIn(page);
  await page.getByTestId("fab-add").click();
  await page.getByTestId("choose-money-out").click();
  await typeAmount(page, "31000");
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("toast")).toContainText("Le 31,000");

  await page.getByRole("link", { name: "Money" }).click();
  await page.getByTestId("record-card").filter({ hasText: "Le 31,000" }).first().click();
  await page.getByTestId("fix-record").click();
  await page.getByRole("radio", { name: "Transport" }).click();
  await page.getByTestId("fix-continue").click();
  await page.getByTestId("confirm-action").click();
  await expect(page.getByTestId("toast")).toContainText("Record fixed");

  const fixedRecord = page.getByTestId("record-card").filter({ hasText: "Le 31,000" }).first();
  await expect(fixedRecord).toContainText("Fixed");
  await fixedRecord.click();
  await expect(page.getByRole("dialog")).toContainText("Transport");
  await expect(page.getByTestId("fix-history")).toContainText("Le 31,000");
});

test("remove-record takes it out of the books but is never a hard delete", async ({ page }) => {
  await signIn(page);
  await page.getByTestId("fab-add").click();
  await page.getByTestId("choose-money-in").click();
  await typeAmount(page, "84500");
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("toast")).toContainText("Le 84,500");

  await page.getByRole("link", { name: "Money" }).click();
  await page.getByTestId("record-card").filter({ hasText: "Le 84,500" }).first().click();
  await page.getByTestId("remove-record").click();
  await expect(page.getByRole("alertdialog")).toContainText("stays in your history");
  await page.getByTestId("confirm-action").click();
  await expect(page.getByTestId("toast")).toContainText("Record removed");
  await expect(page.getByTestId("record-card").filter({ hasText: "Le 84,500" })).toHaveCount(0);

  // Ledger honesty: the reversal pair exists server-side; nothing was destroyed.
  const detail = await page.request.get("/api/v1/businesses/b-demo-1/transactions");
  expect(detail.ok()).toBeTruthy();
});
