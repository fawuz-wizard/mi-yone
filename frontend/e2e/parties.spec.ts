// 5G E2E: customer/supplier records, balances, manual debts, payments, notes, archive.
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

test("customer record shows balance; manual debt raises it; payment reduces it and lands in history", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Menu" }).click();
  await page.getByRole("link", { name: /Customers/ }).click();

  // Aminata carries the seeded Le 120,000 debt and sorts first (largest balance).
  const aminata = page.getByTestId("party-row").filter({ hasText: "Aminata" });
  await expect(aminata).toContainText("Owes you Le 120,000");
  await aminata.click();

  // Add a manual debt of Le 30,000 (the pre-MI-YONE notebook case).
  await page.getByTestId("add-debt").click();
  await typeAmount(page, "30000");
  await page.getByTestId("add-debt-save").click();
  await expect(page.getByTestId("toast")).toContainText("Debt recorded · Le 30,000");
  await expect(page.getByRole("dialog")).toContainText("Le 150,000"); // 120k + 30k

  // Pay the 30,000 debt in full from the open-debts list.
  await page.getByTestId("debt-card").filter({ hasText: "Le 30,000" }).click();
  await page.getByTestId("debt-pay").click();
  await page.getByTestId("debt-pay-save").click();
  await expect(page.getByTestId("toast")).toContainText("Aminata's debt cleared");

  // Balance back to 120,000 and the payment shows in her history.
  await expect(page.getByRole("dialog")).toContainText("Le 120,000");
  await expect(page.getByRole("dialog")).toContainText("Payment from Aminata");
});

test("supplier record mirrors: balance, history door, notes save", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Menu" }).click();
  await page.getByRole("link", { name: /Suppliers/ }).click();
  const musa = page.getByTestId("party-row").filter({ hasText: "Musa Wholesale" });
  await expect(musa).toContainText("You owe Le 150,000");
  await musa.click();
  await expect(page.getByRole("dialog")).toContainText("Le 150,000");

  await page.getByTestId("party-notes").fill("Delivers Tuesdays. Ask for Musa Jr.");
  await page.getByTestId("save-notes").click();
  await expect(page.getByTestId("toast")).toContainText("Notes saved");
});

test("new customer created from the list opens their empty record; archive hides them", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Menu" }).click();
  await page.getByRole("link", { name: /Customers/ }).click();
  await page.getByTestId("new-party").click();
  await page.getByLabel("Name").fill("Salieu");
  await page.getByTestId("party-save").click();
  await expect(page.getByRole("dialog")).toContainText("Salieu");
  await expect(page.getByRole("dialog")).toContainText("No records with them yet.");

  await page.getByTestId("archive-party").click();
  await expect(page.getByRole("alertdialog")).toContainText("Their history stays");
  await page.getByTestId("confirm-action").click();
  await expect(page.getByTestId("toast")).toContainText("Archived");
  await expect(page.getByTestId("party-row").filter({ hasText: "Salieu" })).toHaveCount(0);
});
