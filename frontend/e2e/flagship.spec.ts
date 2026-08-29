// Flagship E2E (Phase 5 §46–47): the first vertical slice, end to end.
// welcome → sign in → home → FAB → sale → keypad → save → toast → list → detail → fix
// plus the idempotency guarantee: duplicate submission = ONE record.
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome/);
  await page.getByRole("link", { name: "I have an account" }).click();
  await page.getByTestId("signin-identifier").fill("mariama@example.sl");
  await page.getByTestId("signin-password").fill("demo-password");
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("business-name")).toHaveText("Mariama's Provisions");
}

async function typeAmount(page: Page, digits: string) {
  for (const d of digits) {
    await page.getByRole("button", { name: d, exact: true }).click();
  }
}

test("ten-second sale: FAB → amount → save → toast → visible in Money", async ({ page }) => {
  await signIn(page);

  await page.getByTestId("fab-add").click();
  await page.getByTestId("choose-money-in").click();
  await typeAmount(page, "45000");
  await expect(page.getByTestId("amount-display")).toContainText("45,000");
  await page.getByTestId("capture-save").click();

  await expect(page.getByTestId("toast")).toContainText("Le 45,000");

  await page.getByRole("link", { name: "Money" }).click();
  await expect(page.getByTestId("record-card").filter({ hasText: "Le 45,000" }).first()).toBeVisible();
});

test("double submission with one idempotency key creates exactly ONE record", async ({ page }) => {
  await signIn(page);
  const request = page.request; // shares the signed-in browser context's cookies
  const key = "e2e-idem-0001-4000-8000-000000000001";
  const body = { type: "INCOME", amount_minor: 7_800_000, source: "SALE" };
  const first = await request.post("/api/v1/businesses/b-demo-1/transactions", {
    data: body,
    headers: { "Idempotency-Key": key },
  });
  const second = await request.post("/api/v1/businesses/b-demo-1/transactions", {
    data: body,
    headers: { "Idempotency-Key": key },
  });
  const firstTx = (await first.json()).data;
  const secondTx = (await second.json()).data;
  expect(first.status()).toBe(201);
  expect(second.status()).toBe(200); // replay, not a new record
  expect(secondTx.id).toBe(firstTx.id);

  const list = await request.get("/api/v1/businesses/b-demo-1/transactions");
  const rows = (await list.json()).data as { amount: { display: string } }[];
  expect(rows.filter((r) => r.amount.display === "Le 78,000")).toHaveLength(1);
});

test("UI double-tap on Save cannot duplicate a record", async ({ page }) => {
  await signIn(page);
  await page.getByTestId("fab-add").click();
  await page.getByTestId("choose-money-in").click();
  await typeAmount(page, "91000");
  const save = page.getByTestId("capture-save");
  await save.dblclick(); // second activation hits a disabled, in-flight button OR replays the same key
  await expect(page.getByTestId("toast")).toContainText("Le 91,000");

  await page.getByRole("link", { name: "Money" }).click();
  await expect(page.getByTestId("record-card").filter({ hasText: "Le 91,000" })).toHaveCount(1);
});

test("fix a record: correction preserves visible history, no delete exists", async ({ page }) => {
  await signIn(page);

  // Create a distinctly wrong record to fix.
  await page.getByTestId("fab-add").click();
  await page.getByTestId("choose-money-in").click();
  await typeAmount(page, "4500");
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("toast")).toContainText("Le 4,500");

  await page.getByRole("link", { name: "Money" }).click();
  await page.getByTestId("record-card").filter({ hasText: "Le 4,500" }).first().click();

  await expect(page.getByRole("dialog")).not.toContainText(/delete/i); // no hard-delete action, ever
  await page.getByTestId("fix-record").click();
  // The fix form pre-fills the current amount (Le 4,500) — clear it, then correct.
  const backspace = page.getByRole("button", { name: "Delete last digit" });
  for (let i = 0; i < 4; i += 1) await backspace.click();
  await typeAmount(page, "45000");
  await page.getByTestId("fix-continue").click();
  await expect(page.getByRole("alertdialog")).toContainText("Le 4,500");
  await page.getByTestId("confirm-action").click();
  await expect(page.getByTestId("toast")).toContainText("Record fixed");

  // The corrected record shows its history; the wrong one no longer appears as posted.
  await page.getByTestId("record-card").filter({ hasText: "Fixed" }).first().click();
  await expect(page.getByTestId("fix-history")).toContainText("was Le 4,500");
  await expect(page.getByTestId("fix-history")).toContainText("Le 45,000");
});
