// The door: welcome → sign up (Setup flow, Phase 5 5I) and sign in.
// Runs unchanged against the mock AND the real backend. On the real backend a
// brand-new EMPTY business is created; in mock mode the labeled single-tenant
// store signs the new account into the example business — either way the flow
// ends signed in, and the first sale records in seconds.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function fillSignup(page: Page, identifier: string) {
  await page.goto("/");
  await page.getByRole("link", { name: "Get started" }).click();
  await page.getByTestId("signup-name").fill("Fatmata Kamara");
  await page.getByTestId("signup-business").fill("Fatmata's Shop");
  await page.getByTestId("signup-identifier").fill(identifier);
  await page.getByTestId("signup-password").fill("first-shop-2026");
}

test("sign up: set up a business, land signed in, record the first sale in seconds", async ({ page }) => {
  await fillSignup(page, "fatmata@example.sl");
  await page.getByTestId("signup-submit").click();

  // Signed in and home — the business identity is live.
  await expect(page.getByTestId("business-name")).not.toBeEmpty();

  // First sale, ten-second style: quick action → amount → save.
  await page.getByTestId("qa-money-in").click();
  for (const d of "5000") await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("toast")).toContainText("Saved · Le 5,000");
});

test("sign up is guarded: short password disables it; a taken identifier fails honestly", async ({ page }) => {
  await fillSignup(page, "mariama@example.sl"); // the demo owner already exists
  // Password shorter than 10 → cannot submit at all.
  await page.getByTestId("signup-password").fill("short");
  await expect(page.getByTestId("signup-submit")).toBeDisabled();
  await page.getByTestId("signup-password").fill("first-shop-2026");
  await page.getByTestId("signup-submit").click();
  await expect(page.getByRole("alert").filter({ hasText: "sign in instead" })).toBeVisible();
  await expect(page).toHaveURL(/signup/); // still here, nothing half-created
});

test("sign in rejects wrong credentials with a calm, uniform message", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "I have an account" }).click();
  await page.getByTestId("signin-identifier").fill("mariama@example.sl");
  await page.getByTestId("signin-password").fill("wrong-password-123");
  await page.getByTestId("signin-submit").click();
  await expect(page.getByRole("alert").filter({ hasText: "couldn't sign you in" })).toBeVisible();
});

test("the two door pages link to each other", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Get started" }).click();
  await expect(page.getByTestId("signup-name")).toBeVisible();
  await page.getByRole("link", { name: "I have an account" }).click();
  await expect(page.getByTestId("signin-identifier")).toBeVisible();
  await page.getByRole("link", { name: /New here/ }).click();
  await expect(page.getByTestId("signup-name")).toBeVisible();
});

test("welcome and signup pass the axe scan", async ({ page }) => {
  await page.goto("/welcome");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
  await page.goto("/signup");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
});
