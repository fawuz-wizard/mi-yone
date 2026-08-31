// Settings center E2E (Menu refinement): sections, profile editing, business
// rename, appearance persistence, alert preferences actually silencing Watch,
// static pages, sign-out, and a dark-mode axe scan.
// Runs unchanged against the mock AND the real backend. Tests that mutate
// shared state (names, prefs) restore it before finishing.
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

async function openMenu(page: Page) {
  await page.getByRole("link", { name: "Menu" }).click();
  await expect(page.getByTestId("menu-profile")).toBeVisible();
}

test("menu is the settings center: profile card + all sections + core nav untouched", async ({ page }) => {
  await signIn(page);
  await openMenu(page);
  await expect(page.getByTestId("menu-profile")).toContainText("Mariama");
  for (const id of ["menu-business", "menu-whatsapp", "menu-appearance", "menu-alerts", "menu-security", "menu-signout"]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Help & support" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Terms & conditions" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Privacy policy" })).toBeVisible();
  await expect(page.getByRole("link", { name: "About MI YONE" })).toBeVisible();
  // Core business functions stay in the primary navigation.
  for (const name of ["Home", "Money", "Stock", "Partner"]) {
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  }
});

test("profile edit persists and restores", async ({ page }) => {
  await signIn(page);
  await openMenu(page);
  await page.getByTestId("menu-profile").click();
  const nameField = page.getByLabel("Your name");
  await nameField.fill("Mariama K.");
  await page.getByTestId("profile-save").click();
  await expect(page.getByTestId("toast")).toContainText("Profile updated");
  await expect(page.getByTestId("menu-profile")).toContainText("Mariama K.");
  // restore
  await page.getByTestId("menu-profile").click();
  await nameField.fill("Mariama");
  await page.getByTestId("profile-save").click();
  await expect(page.getByTestId("toast")).toContainText("Profile updated");
});

test("business rename reflects in the app identity and restores", async ({ page }) => {
  await signIn(page);
  await openMenu(page);
  await page.getByTestId("menu-business").click();
  await expect(page.getByText("Le · SLE")).toBeVisible(); // currency shown honestly
  const field = page.getByLabel("Business name");
  await field.fill("Mariama's Provisions & Sons");
  await page.getByTestId("business-save").click();
  await expect(page.getByTestId("business-name")).toHaveText("Mariama's Provisions & Sons");
  // restore for every later test
  await page.getByTestId("menu-business").click();
  await field.fill("Mariama's Provisions");
  await page.getByTestId("business-save").click();
  await expect(page.getByTestId("business-name")).toHaveText("Mariama's Provisions");
});

test("appearance: dark applies instantly, persists across reload, system is offered", async ({ page }) => {
  await signIn(page);
  await openMenu(page);
  await page.getByTestId("menu-appearance").click();
  await expect(page.getByTestId("theme-system")).toBeVisible();
  await page.getByTestId("theme-dark").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark"); // persisted
  // dark home passes the same accessibility bar as light
  await page.getByRole("link", { name: "Home" }).click();
  await expect(page.getByTestId("left-over")).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
  // back to light for the rest of the suite
  await page.getByRole("link", { name: "Menu" }).click();
  await page.getByTestId("menu-appearance").click();
  await page.getByTestId("theme-light").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("alert preferences silence Business Watch categories and restore", async ({ page }) => {
  await signIn(page);
  // A stock alert exists (seeded low-stock product).
  await expect(page.getByTestId("watch-row").filter({ hasText: "running low" }).first()).toBeVisible();

  await openMenu(page);
  await page.getByTestId("menu-alerts").click();
  await page.getByTestId("alert-pref-stock").click();
  await expect(page.getByTestId("toast")).toContainText("saved");
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: "Home" }).click();
  await expect(page.getByTestId("watch-row").filter({ hasText: "running low" })).toHaveCount(0);

  // restore
  await page.getByRole("link", { name: "Menu" }).click();
  await page.getByTestId("menu-alerts").click();
  await page.getByTestId("alert-pref-stock").click();
  await expect(page.getByTestId("toast")).toContainText("saved");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Home" }).click();
  await expect(page.getByTestId("watch-row").filter({ hasText: "running low" }).first()).toBeVisible();
});

test("help, terms, privacy and about are real pages with real content", async ({ page }) => {
  await signIn(page);
  await openMenu(page);
  await page.getByRole("link", { name: "Help & support" }).click();
  await expect(page.getByText("How do I record a sale?")).toBeVisible();
  await expect(page.getByTestId("help-contact")).toBeVisible();
  await page.goBack();
  await page.getByRole("link", { name: "Terms & conditions" }).click();
  await expect(page.getByTestId("terms-version")).toContainText("Version");
  await expect(page.getByText("not a bank")).toBeVisible();
  await page.goBack();
  await page.getByRole("link", { name: "Privacy policy" }).click();
  await expect(page.getByText("the AI never invents numbers")).toBeVisible();
  await page.goBack();
  await page.getByRole("link", { name: "About MI YONE" }).click();
  await expect(page.getByTestId("about-version")).toContainText("Version");
});

test("security sheet lists this device; sign out ends the session and returns to the door", async ({ page }) => {
  await signIn(page);
  await openMenu(page);
  await page.getByTestId("menu-security").click();
  await expect(page.getByTestId("session-list")).toContainText("This device");
  await page.keyboard.press("Escape");

  await page.getByTestId("menu-signout").click();
  await page.getByTestId("confirm-action").click();
  await expect(page).toHaveURL(/welcome/);
  // The session is really gone: the app routes back to the door, not the dashboard.
  await page.goto("/home");
  await expect(page).toHaveURL(/welcome|signin/);
});
