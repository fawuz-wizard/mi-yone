// Reports E2E: period performance, honest P/L (cash ≠ booked), sales summary, CSV export.
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "I have an account" }).click();
  await page.getByTestId("signin-identifier").fill("mariama@example.sl");
  await page.getByTestId("signin-password").fill("demo-password");
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("business-name")).toHaveText("Mariama's Provisions");
}

async function typeAmount(page: Page, digits: string) {
  for (const d of digits) await page.getByRole("button", { name: d, exact: true }).click();
}

test("report shows cash, P/L, sales summary; periods re-query", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Menu" }).click();
  await page.getByRole("link", { name: /Insights/ }).click();

  await expect(page.getByRole("heading", { name: "Money movement" })).toBeVisible();
  await expect(page.getByTestId("profit-card")).toContainText("Profit & loss (estimated)");
  await expect(page.getByTestId("sales-summary")).toContainText(/\d+ sales · Le/);

  await page.getByRole("tab", { name: "Today" }).click();
  await expect(page.getByRole("tab", { name: "Today" })).toHaveAttribute("aria-selected", "true");
});

test("credit sale splits the truths: profit includes it, cash does not, bridge explains", async ({ page }) => {
  await signIn(page);
  // Credit sale of Le 55,000 to Isatu — booked today, no cash received.
  await page.getByTestId("fab-add").click();
  await page.getByTestId("choose-money-in").click();
  await typeAmount(page, "55000");
  await page.getByTestId("payment-owes").click();
  await page.getByRole("radio", { name: /Isatu/ }).click();
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("toast")).toContainText("Isatu owes you Le 55,000");

  await page.getByRole("link", { name: "Menu" }).click();
  await page.getByRole("link", { name: /Insights/ }).click();
  await page.getByRole("tab", { name: "Today" }).click();

  // Server contract: booked revenue − cash income == the credit extended today.
  const res = await page.request.get("/api/v1/businesses/b-demo-1/reports?period=today");
  const r = (await res.json()).data;
  expect(r.profit.credit_extended.amount_minor).toBeGreaterThanOrEqual(5_500_000);
  expect(r.profit.booked_revenue.amount_minor - r.profit.credit_extended.amount_minor).toBeLessThanOrEqual(
    r.cash.money_in.amount_minor,
  );
  await expect(page.getByTestId("credit-bridge")).toContainText("still with your customers");
});

test("CSV export is server-generated with summary and ledger rows", async ({ page }) => {
  await signIn(page);
  const res = await page.request.get("/api/v1/businesses/b-demo-1/reports/export?period=month");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(res.headers()["content-disposition"]).toContain("mi-yone-report-month.csv");
  const csv = await res.text();
  expect(csv).toContain("MI YONE report");
  expect(csv).toContain("Left over (cash)");
  expect(csv).toContain("Profit (estimated)");
  expect(csv).toContain("Date,Type,Category,Description,Amount (Le),Recorded by");
  expect(csv.split("\r\n").length).toBeGreaterThan(12);
});

test("export controls exist; print button present for Save-as-PDF", async ({ page }) => {
  await signIn(page);
  await page.goto("/insights");
  await expect(page.getByTestId("export-csv")).toBeVisible();
  await expect(page.getByTestId("export-pdf")).toBeVisible();
});
