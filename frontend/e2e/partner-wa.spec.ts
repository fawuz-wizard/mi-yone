// Partner AI + WhatsApp catalog E2E — grounded answers, honest no-data replies,
// import → review → approve/skip, and the full product-experience loop:
// imported product → recorded sale → Partner explains it from real records.
// Runs unchanged against the mock AND the real backend.
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Get started" }).click();
  await page.getByTestId("signin-identifier").fill("mariama@example.sl");
  await page.getByTestId("signin-password").fill("demo-password");
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("business-name")).toHaveText("Mariama's Provisions");
}

async function openPartner(page: Page) {
  await page.getByRole("link", { name: "Partner", exact: true }).click();
  await expect(page.getByTestId("partner-input")).toBeVisible();
}

async function ask(page: Page, text: string) {
  await page.getByTestId("partner-input").fill(text);
  await page.getByTestId("partner-send").click();
}

test("Partner answers a performance question from the records, with provenance", async ({ page }) => {
  await signIn(page);
  await openPartner(page);
  await page.getByTestId("partner-suggestion").first().click(); // "How is my business doing this month?"
  const reply = page.getByTestId("partner-msg-reply").last();
  await expect(reply).toContainText("From your records this month");
  await expect(reply).toContainText("money in");
  await expect(reply).toContainText("From your records"); // provenance line
});

test("Partner is honest when the data does not exist", async ({ page }) => {
  await signIn(page);
  await openPartner(page);
  await ask(page, "How much did I make from sugar?");
  const reply = page.getByTestId("partner-msg-reply").last();
  await expect(reply).toContainText("I don't have any recorded sales of Sugar (1kg)");
});

test("Partner refuses to guess at questions outside the records", async ({ page }) => {
  await signIn(page);
  await openPartner(page);
  await ask(page, "tell me a joke about the weather");
  const reply = page.getByTestId("partner-msg-reply").last();
  await expect(reply).toContainText("I never make figures up");
});

test("Partner surfaces Business Watch when asked what needs attention", async ({ page }) => {
  await signIn(page);
  await openPartner(page);
  await ask(page, "What should I pay attention to?");
  const reply = page.getByTestId("partner-msg-reply").last();
  await expect(reply).toContainText("Business Watch found");
  await expect(reply).toContainText("running low");
});

test("conversation persists across a reload", async ({ page }) => {
  await signIn(page);
  await openPartner(page);
  await ask(page, "Who owes me money?");
  await expect(page.getByTestId("partner-msg-reply").last()).toContainText("owe you");
  await page.reload();
  await expect(page.getByTestId("partner-msg-owner").last()).toContainText("Who owes me money?");
  await expect(page.getByTestId("partner-msg-reply").last()).toContainText("owe you");
});

test("WhatsApp: connect → import → review with duplicate warning, incomplete price, approve and skip", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Stock" }).click();
  await page.getByTestId("wa-open").click();

  // Honest test-mode label — no fake live connection.
  await expect(page.getByTestId("wa-test-note")).toContainText("test mode");
  await page.getByTestId("wa-connect").click();
  await expect(page.getByText("Connected")).toBeVisible();
  await page.getByTestId("wa-import").click();

  const items = page.getByTestId("wa-item");
  await expect(items).toHaveCount(5);

  // Duplicate detection: catalog "Rice 50kg" vs existing "Rice (50kg bag)".
  const rice = items.filter({ hasText: "Rice 50kg" });
  await expect(rice.getByTestId("wa-dup-warn")).toContainText("May already exist as Rice (50kg bag)");
  await rice.getByTestId("wa-skip").click();
  await expect(page.getByTestId("toast")).toContainText("Skipped · Rice 50kg");

  // Approve a complete item with opening stock.
  const palm = items.filter({ hasText: "Palm oil (1L)" });
  await palm.getByTestId("wa-stock-input").fill("10");
  await palm.getByTestId("wa-approve").click();
  await expect(page.getByTestId("toast")).toContainText("Added · Palm oil (1L)");

  // Incomplete item: no price → approve disabled until one is set.
  const maggi = items.filter({ hasText: "Maggi cubes (pack)" });
  await expect(maggi.getByTestId("wa-approve")).toBeDisabled();
  await maggi.getByTestId("wa-price-input").fill("3000");
  await maggi.getByTestId("wa-approve").click();
  await expect(page.getByTestId("toast")).toContainText("Added · Maggi cubes (pack)");

  // The approved items are now first-class products in the stock list.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("product-row").filter({ hasText: "Palm oil (1L)" })).toContainText("10 left");
  await expect(page.getByTestId("product-row").filter({ hasText: "Maggi cubes (pack)" })).toBeVisible();
  await expect(page.getByTestId("product-row").filter({ hasText: "Rice 50kg" })).toHaveCount(0); // skipped
});

test("the loop: sell an imported product, then the Partner explains it from real records", async ({ page }) => {
  await signIn(page);
  // Record a sale of the imported Palm oil through the normal quick entry.
  await page.getByTestId("fab-add").click();
  await page.getByTestId("choose-money-in").click();
  await page.getByTestId("nlc-input").fill("sold 2 palm oil at 25000 each");
  await page.getByTestId("nlc-fill").click();
  await expect(page.getByTestId("nlc-summary")).toContainText("2 × Palm oil (1L)");
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("toast")).toContainText("Saved · Le 50,000");

  await openPartner(page);
  await ask(page, "How much did I make from palm oil?");
  const reply = page.getByTestId("partner-msg-reply").last();
  await expect(reply).toContainText("2");
  await expect(reply).toContainText("Palm oil (1L)");
  await expect(reply).toContainText("Current stock: 8"); // 10 imported − 2 sold, verified
});
