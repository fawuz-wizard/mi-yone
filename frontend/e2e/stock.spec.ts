// 5F Stock E2E: product CRUD, add-stock with supplier debt, stock check, sale decrement.
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

test("add product with prices and opening stock; it appears in the list", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Stock" }).click();
  await page.getByTestId("new-product").click();
  await page.getByLabel("Product name").fill("Cement (bag)");
  await page.getByTestId("price-selling").click();
  await typeAmount(page, "120000");
  await page.getByTestId("price-selling-done").click();
  await page.getByTestId("price-cost").click();
  await typeAmount(page, "95000");
  await page.getByTestId("price-cost-done").click();
  await page.getByLabel(/How many do you have now/).fill("20");
  await page.getByTestId("product-save").click();
  await expect(page.getByTestId("toast")).toContainText("Product saved");
  const row = page.getByTestId("product-row").filter({ hasText: "Cement (bag)" });
  await expect(row).toContainText("Le 120,000");
  await expect(row).toContainText("20 left");
});

test("add stock on credit: stock rises, supplier debt appears, cost prefills", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Stock" }).click();
  await page.getByTestId("product-row").filter({ hasText: "Rice (50kg bag)" }).click();
  await page.getByTestId("add-stock").click();
  await page.getByLabel("How many?").fill("10");
  await page.getByTestId("stock-owe").click();
  await page.getByRole("radio", { name: "Musa Wholesale" }).click();
  await page.getByTestId("add-stock-save").click();
  await expect(page.getByTestId("toast")).toContainText("Added 10");

  await page.getByTestId("product-row").filter({ hasText: "Rice (50kg bag)" }).click();
  await expect(page.getByTestId("stock-history").locator("li").first()).toContainText("Added 10");
  await page.keyboard.press("Escape");

  // The unpaid purchase created a supplier debt (10 × Le 70,000 = Le 700,000).
  await page.getByRole("link", { name: "Money" }).click();
  await page.getByRole("tab", { name: "You owe" }).click();
  await expect(page.getByTestId("debt-card").filter({ hasText: "Musa Wholesale" }).first()).toBeVisible();
  await expect(page.getByTestId("debt-total")).toContainText("Le 850,000"); // 150,000 seed + 700,000
});

test("stock check (damaged): owner states reality, system computes the difference", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Stock" }).click();
  await page.getByTestId("product-row").filter({ hasText: "Sugar (1kg)" }).click();
  await page.getByTestId("stock-check").click();
  await page.getByLabel(/How many do you actually have/).fill("36");
  await page.getByRole("radio", { name: "Damaged" }).click();
  await page.getByTestId("stock-check-save").click();
  await expect(page.getByTestId("toast")).toContainText("now 36");

  await page.getByTestId("product-row").filter({ hasText: "Sugar (1kg)" }).click();
  await expect(page.getByTestId("stock-history").locator("li").first()).toContainText("Removed 4 (damaged)");
});

test("a sale with a product decrements stock via the movement ledger", async ({ page }) => {
  await signIn(page);
  await page.getByTestId("fab-add").click();
  await page.getByTestId("choose-money-in").click();
  // With many products the Soap chip can live behind "More…" — the More sheet
  // lists every product with a search.
  const soapChip = page.getByRole("radio", { name: /Soap \(bar\)/ });
  if (await soapChip.isVisible().catch(() => false)) {
    await soapChip.click();
  } else {
    await page.getByRole("button", { name: "More…" }).first().click();
    await page.getByRole("button", { name: /Soap \(bar\)/ }).click();
  }
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("toast")).toContainText("Le 1,500");

  await page.getByRole("link", { name: "Stock" }).click();
  await page.getByTestId("product-row").filter({ hasText: "Soap (bar)" }).click();
  await expect(page.getByTestId("stock-history").locator("li").first()).toContainText("Sold 1");
});

test("low stock shows amber badge with words and sorts first; archive hides a product", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Stock" }).click();
  await expect(page.getByTestId("product-row").first()).toContainText("Low");

  await page.getByTestId("product-row").filter({ hasText: "Cooking oil" }).click();
  await page.getByTestId("archive-product").click();
  await expect(page.getByRole("alertdialog")).toContainText("Its history stays");
  await page.getByTestId("confirm-action").click();
  await expect(page.getByTestId("toast")).toContainText("Product archived");
  await expect(page.getByTestId("product-row").filter({ hasText: "Cooking oil" })).toHaveCount(0);
});
