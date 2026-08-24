// Performance chart E2E: server-computed data, range filters, change badge, a11y.
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

test("chart renders from ledger-computed data with a % change badge", async ({ page }) => {
  await signIn(page);
  await expect(page.getByTestId("perf-chart")).toBeVisible();

  // Server contract: percentage and buckets computed backend-side, never hardcoded.
  const res = await page.request.get("/api/v1/businesses/b-demo-1/analytics/performance?range=30d");
  const body = (await res.json()).data;
  expect(body.buckets.length).toBe(30);
  expect(body.totals.net.display).toMatch(/^Le /);
  // change_pct is either a signed 1dp string or null (near-zero-base guard).
  if (body.change_pct !== null) {
    expect(body.change_pct).toMatch(/^[+−]\d+(\.\d)?$/);
    await expect(page.getByTestId("perf-badge")).toContainText(/[↑↓] [+−][\d,]+\.?\d*% (Progression|Regression)/);
  } else {
    await expect(page.getByTestId("perf-badge")).toHaveCount(0);
  }
});

test("range filters re-query and re-render", async ({ page }) => {
  await signIn(page);
  const chart = page.getByTestId("perf-chart");
  await expect(chart).toBeVisible();
  await page.getByRole("tab", { name: "1Y" }).click();
  await expect(page.getByRole("tab", { name: "1Y" })).toHaveAttribute("aria-selected", "true");
  const res = await page.request.get("/api/v1/businesses/b-demo-1/analytics/performance?range=1y");
  expect(((await res.json()).data.buckets as unknown[]).length).toBe(12);
});

test("keyboard access: arrow keys move the reading, tooltip shows every series", async ({ page }) => {
  await signIn(page);
  const chart = page.getByTestId("perf-chart");
  await expect(chart).toBeVisible();
  await chart.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const tooltip = page.getByTestId("perf-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Money in");
  await expect(tooltip).toContainText("Money out");
  await expect(tooltip).toContainText("Left over");
  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
});

test("axe: home with chart stays clean of serious/critical violations", async ({ page }) => {
  await signIn(page);
  await expect(page.getByTestId("perf-chart")).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious, serious.map((v) => v.id).join(", ")).toHaveLength(0);
});
