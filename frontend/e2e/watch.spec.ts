// Business Watch + progression/regression trends E2E.
// Runs unchanged against the mock AND the real backend (seed parity).
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "I have an account" }).click();
  await page.getByTestId("signin-identifier").fill("mariama@example.sl");
  await page.getByTestId("signin-password").fill("demo-password");
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("business-name")).toHaveText("Mariama's Provisions");
}

test("watch surfaces real recorded conditions: low stock + overdue debt, with why and action", async ({ page }) => {
  await signIn(page);

  // Guarantee a low-stock condition of this test's own (3 ≤ default threshold 5) —
  // run-order independent; the seed's Cooking oil (3 left) shows the same live.
  await page.getByRole("link", { name: "Stock" }).click();
  await page.getByTestId("new-product").click();
  await page.getByLabel("Product name").fill("Kerosene (bottle)");
  await page.getByTestId("price-selling").click();
  for (const d of "8000") await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByTestId("price-selling-done").click();
  await page.getByLabel(/How many do you have now/).fill("3");
  await page.getByTestId("product-save").click();
  await expect(page.getByTestId("toast")).toContainText("Product saved");
  await page.getByRole("link", { name: "Home" }).click();

  const section = page.getByTestId("watch-section");
  await expect(section).toBeVisible();
  const lowRow = page.getByTestId("watch-row").filter({ hasText: "running low" });
  await expect(lowRow).toBeVisible();

  // Overdue customer payment (Aminata's Le 120,000). The alert now says how
  // long the money has been owed rather than referring to a due date, because
  // nothing in the product ever sets one.
  const overdueRow = page.getByTestId("watch-row").filter({ hasText: "owed you" });
  await expect(overdueRow).toContainText("Aminata");
  await expect(overdueRow).toContainText("Le 120,000");

  // What happened → tap → why it matters + what to do + a way in
  await overdueRow.getByRole("button").click();
  const details = page.getByTestId("watch-details");
  await expect(details).toContainText("Why it matters");
  await expect(details).toContainText("cash you cannot use");
  await expect(details).toContainText("What you can do");
  await expect(details.getByRole("link", { name: /Open/ })).toBeVisible();
});

test("watch never duplicates an alert for the same condition", async ({ page }) => {
  await signIn(page);
  await expect(page.getByTestId("watch-row").filter({ hasText: "owed you" })).toHaveCount(1);
  // Re-visit Home — derived state, not an accumulating log
  await page.getByRole("link", { name: "Money" }).click();
  await page.getByRole("link", { name: "Home" }).click();
  await expect(page.getByTestId("watch-row").filter({ hasText: "owed you" })).toHaveCount(1);
});

test("trend tiles show current value with an honest direction indicator", async ({ page }) => {
  await signIn(page);
  const row = page.getByTestId("trends-row");
  await expect(row).toBeVisible();
  await expect(row).toContainText("Last 30 days vs the 30 days before");
  await expect(page.getByTestId("trend-sales")).toContainText("Le");
  await expect(page.getByTestId("trend-money_out")).toContainText("Le");
  // seeded history is dense — the cash metrics carry a real comparison arrow
  await expect(page.getByTestId("trend-left_over")).toContainText(/[↑↓→]/);
});

test("watch updates as records change: counting a product to zero raises sold-out", async ({ page }) => {
  await signIn(page);

  // A product of this test's own, so the flow is deterministic in any run order.
  await page.getByRole("link", { name: "Stock" }).click();
  await page.getByTestId("new-product").click();
  await page.getByLabel("Product name").fill("Torch batteries");
  await page.getByTestId("price-selling").click();
  for (const d of "5000") await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByTestId("price-selling-done").click();
  await page.getByLabel(/How many do you have now/).fill("4");
  await page.getByTestId("product-save").click();
  await expect(page.getByTestId("toast")).toContainText("Product saved");

  await page.getByTestId("product-row").filter({ hasText: "Torch batteries" }).click();
  await page.getByTestId("stock-check").click();
  await page.getByLabel(/How many do you actually have/).fill("0");
  await page.getByRole("radio", { name: "Counted" }).click();
  await page.getByTestId("stock-check-save").click();
  await expect(page.getByTestId("toast")).toBeVisible();

  await page.getByRole("link", { name: "Home" }).click();
  const soldOut = page.getByTestId("watch-row").filter({ hasText: "sold out" });
  await expect(soldOut).toContainText("Torch batteries");
});

test("home with watch + trends passes the axe scan", async ({ page }) => {
  await signIn(page);
  await expect(page.getByTestId("watch-section")).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("overview refinement: profit margin, spending summary, contributors, Partner line", async ({ page }) => {
  await signIn(page);
  // Month view is dense in the seed everywhere; today may be empty.
  await page.getByRole("tab", { name: "This month" }).click();

  // Estimated profit with a server-computed margin — rendered verbatim.
  await expect(page.getByTestId("profit-row")).toContainText("Le");
  await expect(page.getByTestId("profit-margin")).toContainText("%");

  // Spending summary: top categories for the period + link to the full breakdown.
  await expect(page.getByTestId("spending-card")).toBeVisible();
  expect(await page.getByTestId("spending-category").count()).toBeGreaterThan(0);
  await expect(page.getByTestId("spending-card")).toContainText("Le");
  await expect(page.getByTestId("spending-see-all")).toBeVisible();

  // Contribution analysis: factual "largest change" sentences, never causal.
  const contribs = page.getByTestId("contributor-line");
  expect(await contribs.count()).toBeGreaterThan(0);
  for (const text of await contribs.allTextContents()) {
    expect(text.toLowerCase()).not.toContain("caused");
    expect(text.toLowerCase()).not.toContain("because");
    expect(text).toMatch(/change|moved|influence/i);
  }

  // Partner overview line occupies the insight slot and hands off to the Partner.
  await expect(page.getByText(/What you kept (improved|declined|held steady)/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Ask the Partner/ })).toBeVisible();
});
