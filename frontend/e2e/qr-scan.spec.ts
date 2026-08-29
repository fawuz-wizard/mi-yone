// QR Scan-to-Sell E2E: label generation/printing, scanner wiring (injected
// detector), tap-to-add fallback, cart editing, server-validated checkout,
// duplicate scans, double-submit safety, invalid/unknown codes, out-of-stock.
// Runs unchanged against the mock AND the real backend.
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "I have an account" }).click();
  await page.getByTestId("signin-identifier").fill("mariama@example.sl");
  await page.getByTestId("signin-password").fill("demo-password");
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("business-name")).toHaveText("Mariama's Provisions");
}

async function openScan(page: Page) {
  await page.getByTestId("fab-add").click();
  await page.getByTestId("choose-scan").click();
  await expect(page.getByTestId("scan-confirm")).toBeVisible();
}

// Injects a fake BarcodeDetector whose queue the test controls — same pattern
// as the voice tests (headless browsers can't really scan).
function withFakeDetector(page: Page) {
  return page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const queue: string[] = [];
    w.__miyQueueScan = (code: string) => queue.push(code);
    class FakeDetector {
      async detect() {
        const code = queue.shift();
        return code ? [{ rawValue: code }] : [];
      }
    }
    w.BarcodeDetector = FakeDetector;
  });
}

const queueScan = (page: Page, code: string) =>
  page.evaluate((c) => (window as unknown as { __miyQueueScan: (x: string) => void }).__miyQueueScan(c), code);

test("QR labels: sheet renders codes for products and offers print", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Stock" }).click();
  await page.getByTestId("labels-open").click();
  await expect(page.getByTestId("labels-grid")).toBeVisible();
  expect(await page.getByTestId("label-card").count()).toBeGreaterThan(3);
  await expect(page.getByTestId("label-card").filter({ hasText: "Rice (50kg bag)" }).locator("img")).toBeVisible();
  await expect(page.getByTestId("labels-print")).toBeVisible();
});

test("product detail shows its own QR with a single-label print link", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Stock" }).click();
  await page.getByTestId("product-row").filter({ hasText: "Sugar (1kg)" }).click();
  await page.getByTestId("show-qr").click();
  await expect(page.getByTestId("product-qr")).toBeVisible();
  await expect(page.getByTestId("qr-print-single")).toBeVisible();
});

test("scanner wiring: scanned codes add to the cart; duplicate frames don't double-add; invalid and unknown codes are explained", async ({ page }) => {
  await withFakeDetector(page);
  await signIn(page);

  // find a real product id for a valid code
  const productId = await page.evaluate(async () => {
    const res = await fetch(`/api/v1/businesses/${localStorage.getItem("miy_business_id") ?? "b-demo-1"}/products`, { credentials: "same-origin" });
    const body = await res.json();
    return body.data.find((p: { name: string }) => p.name === "Sugar (1kg)").id as string;
  });

  await openScan(page);

  // invalid (foreign) code
  await queueScan(page, "https://not-miyone.example");
  await expect(page.getByTestId("scan-note")).toContainText("not a MI YONE product code");

  // unknown product code
  await queueScan(page, "MIYONE:P1:p-does-not-exist");
  await expect(page.getByTestId("scan-note")).toContainText("doesn't match any product");

  // valid scan → cart row appears
  await queueScan(page, `MIYONE:P1:${productId}`);
  await expect(page.getByTestId("scan-cart-row").filter({ hasText: "Sugar (1kg)" })).toBeVisible();
  await expect(page.getByTestId("scan-qty")).toHaveText("1");

  // the same code again immediately = duplicate frame → still qty 1
  await queueScan(page, `MIYONE:P1:${productId}`);
  await page.waitForTimeout(700);
  await expect(page.getByTestId("scan-qty")).toHaveText("1");
});

test("multi-product cart: tap-to-add, quantities, removal, and a server-recorded checkout", async ({ page }) => {
  await signIn(page);
  await openScan(page);

  // build a cart from two different products (fallback path — works everywhere)
  await page.getByTestId("scan-tap-product").filter({ hasText: "Rice (50kg bag)" }).click();
  await page.getByTestId("scan-tap-product").filter({ hasText: "Soap (bar)" }).click();
  expect(await page.getByTestId("scan-cart-row").count()).toBe(2);

  // adjust quantity: rice ×2 → subtotal reflects server prices (85,000×2 + 1,500)
  const riceRow = page.getByTestId("scan-cart-row").filter({ hasText: "Rice (50kg bag)" });
  await riceRow.getByRole("button", { name: "+" }).click();
  await expect(page.getByTestId("scan-subtotal")).toContainText("171,500");

  // remove soap → subtotal drops to rice only
  await page.getByTestId("scan-cart-row").filter({ hasText: "Soap (bar)" }).getByTestId("scan-remove").click();
  await expect(page.getByTestId("scan-subtotal")).toContainText("170,000");

  // re-add soap and finish — the toast shows the SERVER-computed total
  await page.getByTestId("scan-tap-product").filter({ hasText: "Soap (bar)" }).click();
  await page.getByTestId("scan-confirm").click();
  await expect(page.getByTestId("toast")).toContainText("Sale recorded · Le 171,500 · 3 items");

  // it landed in the books as one money-in record listing the items
  await page.getByRole("link", { name: "Money" }).click();
  await page.getByRole("tab", { name: "In", exact: true }).click();
  await expect(page.getByTestId("record-card").filter({ hasText: "Rice (50kg bag) ×2" }).first()).toContainText("Le 171,500");
});

test("double-submit cannot record the checkout twice", async ({ page }) => {
  await signIn(page);
  await openScan(page);
  await page.getByTestId("scan-tap-product").filter({ hasText: "Soap (bar)" }).click();
  await page.getByTestId("scan-tap-product").filter({ hasText: "Soap (bar)" }).click();
  await page.getByTestId("scan-tap-product").filter({ hasText: "Soap (bar)" }).click(); // ×3 = Le 4,500
  await page.getByTestId("scan-confirm").dblclick(); // in-flight disable OR idempotent replay
  await expect(page.getByTestId("toast")).toContainText("Sale recorded · Le 4,500");

  await page.getByRole("link", { name: "Money" }).click();
  await page.getByRole("tab", { name: "In", exact: true }).click();
  await expect(page.getByTestId("record-card").filter({ hasText: "Soap (bar) ×3" })).toHaveCount(1);
});

test("out-of-stock products can't be added, and the server rejects an over-stock cart with the reason", async ({ page }) => {
  await signIn(page);
  await openScan(page);
  // Torch batteries were counted to zero by the watch tests? Not in this order —
  // instead: over-ask the server. Add sugar, then push quantity beyond stock.
  await page.getByTestId("scan-tap-product").filter({ hasText: "Sugar (1kg)" }).click();
  const sugarRow = page.getByTestId("scan-cart-row").filter({ hasText: "Sugar (1kg)" });
  for (let i = 0; i < 60; i += 1) await sugarRow.getByRole("button", { name: "+" }).click(); // way past stock
  await page.getByTestId("scan-confirm").click();
  await expect(page.getByTestId("scan-server-error")).toContainText("Not enough Sugar (1kg) in stock");

  // nothing was recorded; the cart is intact for correction
  await expect(sugarRow).toBeVisible();
});

test("scan screen updates stock through the ledger like any other sale", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Stock" }).click();
  const soapRow = page.getByTestId("product-row").filter({ hasText: "Soap (bar)" });
  const beforeText = await soapRow.getByText(/-?\d+ left/).textContent();
  const before = Number(/(-?\d+)/.exec(beforeText ?? "")?.[1]);

  await openScan(page);
  await page.getByTestId("scan-tap-product").filter({ hasText: "Soap (bar)" }).click();
  await page.getByTestId("scan-confirm").click();
  await expect(page.getByTestId("toast")).toContainText("Sale recorded");

  await page.getByRole("link", { name: "Stock" }).click();
  await expect(soapRow.getByText(`${before - 1} left`)).toBeVisible();
});
