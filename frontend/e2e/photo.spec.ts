// Photo-to-Product E2E: capture/upload, preview, replace/remove, validation,
// duplicate warning, honest AI-suggestion absence (no provider configured),
// and full integration — the photo product sells like any other product.
// Runs unchanged against the mock AND the real backend.
import { expect, test, type Page } from "@playwright/test";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "I have an account" }).click();
  await page.getByTestId("signin-identifier").fill("mariama@example.sl");
  await page.getByTestId("signin-password").fill("demo-password");
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("business-name")).toHaveText("Mariama's Provisions");
}

async function openCreateForm(page: Page) {
  await page.getByRole("link", { name: "Stock" }).click();
  await page.getByTestId("new-product").click();
  await expect(page.getByTestId("photo-take")).toBeVisible(); // photo-first flow
}

function setPhoto(page: Page, name = "lamp.png", mimeType = "image/png", buffer: Buffer = PNG) {
  return page.getByTestId("photo-gallery-input").setInputFiles({ name, mimeType, buffer });
}

test("photo → preview → replace/remove → details → save → product exists with its image", async ({ page }) => {
  await signIn(page);
  await openCreateForm(page);

  // Pick a photo, see the preview.
  await setPhoto(page);
  await expect(page.getByTestId("photo-preview")).toBeVisible();

  // No AI provider configured → suggestions are honestly absent, never faked.
  await expect(page.getByTestId("photo-suggestions")).toHaveCount(0);

  // Replace and remove work before saving.
  await page.getByTestId("photo-replace").click();
  await setPhoto(page, "lamp2.png");
  await expect(page.getByTestId("photo-preview")).toBeVisible();
  await page.getByTestId("photo-remove").click();
  await expect(page.getByTestId("photo-preview")).toHaveCount(0);
  await setPhoto(page);

  // Details: name + price required, the rest optional.
  await page.getByLabel("Product name").fill("Solar lamp");
  await page.getByTestId("price-selling").click();
  for (const d of "45000") await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByTestId("price-selling-done").click();
  await page.getByLabel(/Category/).fill("Electronics");
  await page.getByLabel(/How many do you have now/).fill("6");
  await page.getByTestId("product-save").click();
  await expect(page.getByTestId("toast")).toContainText("Product saved");

  // The product is real, listed, and carries its photo.
  const row = page.getByTestId("product-row").filter({ hasText: "Solar lamp" });
  await expect(row).toContainText("Le 45,000");
  await row.click();
  await expect(page.getByTestId("detail-photo")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("missing required information keeps Save disabled", async ({ page }) => {
  await signIn(page);
  await openCreateForm(page);
  await expect(page.getByTestId("product-save")).toBeDisabled(); // nothing filled
  await page.getByLabel("Product name").fill("Something");
  await expect(page.getByTestId("product-save")).toBeDisabled(); // price still missing
  await page.keyboard.press("Escape"); // product sheet closes directly
});

test("an unsupported file is rejected with a clear message, nothing breaks", async ({ page }) => {
  await signIn(page);
  await openCreateForm(page);
  await page.getByTestId("photo-gallery-input").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByTestId("photo-error")).toContainText("JPG, PNG, or WebP");
  await expect(page.getByTestId("photo-preview")).toHaveCount(0);
  // recovery: a valid photo still works
  await setPhoto(page);
  await expect(page.getByTestId("photo-preview")).toBeVisible();
  await page.keyboard.press("Escape"); // product sheet closes directly
});

test("an obvious duplicate name is flagged before saving — owner decides", async ({ page }) => {
  await signIn(page);
  await openCreateForm(page);
  await page.getByLabel("Product name").fill("Rice bag");
  await expect(page.getByTestId("product-dup-warn")).toContainText("Rice (50kg bag)");
  await page.keyboard.press("Escape"); // product sheet closes directly
});

test("a photo product sells exactly like any other product", async ({ page }) => {
  await signIn(page);
  // "Solar lamp" was created in the first test of this file (with 6 in stock).
  await page.getByTestId("fab-add").click();
  await page.getByTestId("choose-money-in").click();
  await page.getByTestId("nlc-input").fill("sold 1 solar lamp at 45000");
  await page.getByTestId("nlc-fill").click();
  await expect(page.getByTestId("nlc-summary")).toContainText("1 × Solar lamp");
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("toast")).toContainText("Saved · Le 45,000");

  await page.getByRole("link", { name: "Stock" }).click();
  await expect(page.getByTestId("product-row").filter({ hasText: "Solar lamp" })).toContainText("5 left");
});
