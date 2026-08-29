// Natural-language + voice sales capture E2E — the feature's full test matrix:
// English text, Krio text, voice input (injected recognition), missing price,
// invalid input, duplicate submission, inventory + transaction updates.
// Runs unchanged against the mock AND the real backend (it only uses the
// existing sale path — the interpreter is client-side input assistance).
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Get started" }).click();
  await page.getByTestId("signin-identifier").fill("mariama@example.sl");
  await page.getByTestId("signin-password").fill("demo-password");
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("business-name")).toHaveText("Mariama's Provisions");
}

async function openSaleCapture(page: Page) {
  await page.getByTestId("fab-add").click();
  await page.getByTestId("choose-money-in").click();
  await expect(page.getByTestId("nlc-input")).toBeVisible();
}

test("English text: 'Sold 3 bags of rice at 350 each' → preview → record → ledger + stock update", async ({ page }) => {
  await signIn(page);

  // Note the rice stock before the sale.
  await page.getByRole("link", { name: "Stock" }).click();
  const riceRow = page.getByTestId("product-row").filter({ hasText: "Rice (50kg bag)" });
  const beforeText = await riceRow.getByText(/\d+ left/).textContent();
  const before = Number(/(\d+)/.exec(beforeText ?? "")?.[1]);
  await page.getByRole("link", { name: "Home" }).click();

  await openSaleCapture(page);
  await page.getByTestId("nlc-input").fill("Sold 3 bags of rice at 350 each");
  await page.getByTestId("nlc-fill").click();

  // The form is the confirmation preview: product, quantity, amount all visible.
  await expect(page.getByTestId("nlc-summary")).toContainText("3 × Rice (50kg bag)");
  await expect(page.getByTestId("nlc-summary")).toContainText("at Le 350 each");
  await expect(page.getByRole("radio", { name: /Rice \(50kg bag\)/ })).toBeChecked();
  await expect(page.getByTestId("amount-display")).toContainText("1,050");

  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("toast")).toContainText("Saved · Le 1,050");

  // Financial record exists…
  await page.getByRole("link", { name: "Money" }).click();
  await page.getByRole("tab", { name: "In", exact: true }).click();
  await expect(page.getByTestId("record-card").filter({ hasText: "Le 1,050" }).first()).toBeVisible();

  // …and inventory went down by exactly the spoken quantity.
  await page.getByRole("link", { name: "Stock" }).click();
  await expect(riceRow.getByText(`${before - 3} left`)).toBeVisible();
});

test("Krio text: 'Ah sell tri bag rice fo tri ondred en fifti each' parses the same", async ({ page }) => {
  await signIn(page);
  await openSaleCapture(page);
  await page.getByTestId("nlc-input").fill("Ah sell tri bag rice fo tri ondred en fifti each");
  await page.getByTestId("nlc-fill").click();
  await expect(page.getByTestId("nlc-summary")).toContainText("3 × Rice (50kg bag)");
  await expect(page.getByRole("radio", { name: /Rice \(50kg bag\)/ })).toBeChecked();
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("toast")).toContainText("Saved · Le 1,050");
});

test("voice input feeds the same interpreter (recognition injected)", async ({ page }) => {
  // Headless Chromium has no microphone — inject a minimal SpeechRecognition
  // that speaks the brief's example. This tests the full voice wiring.
  await page.addInitScript(() => {
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      start() {
        setTimeout(() => {
          this.onresult?.({
            resultIndex: 0,
            results: [{ 0: { transcript: "Ah sell three bag rice for three hundred and fifty each" }, isFinal: true, length: 1 }],
          });
          this.onend?.();
        }, 50);
      }
      stop() {
        this.onend?.();
      }
    }
    // Override BOTH names — headless Chromium exposes a native (non-working)
    // SpeechRecognition that would otherwise win.
    const w = window as unknown as Record<string, unknown>;
    w.SpeechRecognition = FakeRecognition;
    w.webkitSpeechRecognition = FakeRecognition;
  });

  await signIn(page);
  await openSaleCapture(page);
  await page.getByTestId("nlc-mic").click();
  await expect(page.getByTestId("nlc-input")).toHaveValue(/three bag rice/);
  await expect(page.getByTestId("nlc-summary")).toContainText("3 × Rice (50kg bag)");
  await expect(page.getByRole("radio", { name: /Rice \(50kg bag\)/ })).toBeChecked();
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("toast")).toContainText("Saved · Le 1,050");
});

test("missing price: uses the product's own set price and says so", async ({ page }) => {
  await signIn(page);
  await openSaleCapture(page);
  await page.getByTestId("nlc-input").fill("sold 2 bags of rice");
  await page.getByTestId("nlc-fill").click();
  await expect(page.getByTestId("nlc-summary")).toContainText("we used your set price");
  // 2 × Le 85,000 catalog price — visible for review, not silently saved.
  await expect(page.getByTestId("amount-display")).toContainText("170,000");
});

test("missing quantity: asks instead of guessing — Save stays disabled", async ({ page }) => {
  await signIn(page);
  await openSaleCapture(page);
  await page.getByTestId("nlc-input").fill("sold rice at 400");
  await page.getByTestId("nlc-fill").click();
  await expect(page.getByTestId("nlc-summary")).toContainText("How many were sold?");
  await expect(page.getByTestId("capture-save")).toBeDisabled(); // no amount → cannot record
});

test("invalid input: flagged, nothing applied, nothing saveable", async ({ page }) => {
  await signIn(page);
  await openSaleCapture(page);
  await page.getByTestId("nlc-input").fill("hello how are you");
  await page.getByTestId("nlc-fill").click();
  await expect(page.getByTestId("nlc-summary")).toContainText("couldn't find a sale");
  await expect(page.getByTestId("capture-save")).toBeDisabled();
});

test("credit sale in mixed English/Krio: customer + owes-you preselected", async ({ page }) => {
  await signIn(page);
  await openSaleCapture(page);
  await page.getByTestId("nlc-input").fill("Isatu tek 2 bar soap, i go pay later");
  await page.getByTestId("nlc-fill").click();
  await expect(page.getByTestId("payment-owes")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: /Isatu/ })).toBeChecked();
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("toast")).toContainText("Isatu owes you Le 3,000");
});

test("duplicate submission: double-press records exactly one sale", async ({ page }) => {
  await signIn(page);
  await openSaleCapture(page);
  await page.getByTestId("nlc-input").fill("Sold 1 bag of rice at 777 each");
  await page.getByTestId("nlc-fill").click();
  await page.getByTestId("capture-save").dblclick(); // in-flight button is disabled OR the key replays
  await expect(page.getByTestId("toast")).toContainText("Saved · Le 777");

  await page.getByRole("link", { name: "Money" }).click();
  await page.getByRole("tab", { name: "In", exact: true }).click();
  await expect(page.getByTestId("record-card").filter({ hasText: "Le 777" })).toHaveCount(1);
});

// ---------------------------------------------------------------------------
// Record interpretation & validation layer (feature brief 2)
// ---------------------------------------------------------------------------

test("expense routing: 'Paid 100,000 for transport' switches to the expense form, category matched", async ({ page }) => {
  await signIn(page);
  await openSaleCapture(page);
  await page.getByTestId("nlc-input").fill("Paid 100,000 for transport");
  await page.getByTestId("nlc-fill").click();
  // The sheet re-routes itself to the expense form…
  await expect(page.getByRole("heading", { name: "Money out · Expense" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Transport" })).toBeChecked();
  await expect(page.getByTestId("amount-display")).toContainText("100,000");
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("toast")).toContainText("Saved · Le 100,000");

  await page.getByRole("link", { name: "Money" }).click();
  await page.getByRole("tab", { name: "Out", exact: true }).click();
  await expect(page.getByTestId("record-card").filter({ hasText: "Le 100,000" }).first()).toBeVisible();
});

test("purchase routing: 'Bought 10 bags of rice at 300 each' → stock in via the existing endpoint", async ({ page }) => {
  await signIn(page);

  await page.getByRole("link", { name: "Stock" }).click();
  const riceRow = page.getByTestId("product-row").filter({ hasText: "Rice (50kg bag)" });
  const beforeText = await riceRow.getByText(/\d+ left/).textContent();
  const before = Number(/(\d+)/.exec(beforeText ?? "")?.[1]);
  await page.getByRole("link", { name: "Home" }).click();

  await openSaleCapture(page);
  await page.getByTestId("nlc-input").fill("Bought 10 bags of rice at 70,000 each");
  await page.getByTestId("nlc-fill").click();
  await expect(page.getByTestId("nlc-purchase-card")).toBeVisible();
  await expect(page.getByTestId("nlc-purchase-qty")).toHaveValue("10");
  await expect(page.getByTestId("nlc-purchase-cost")).toHaveValue("70000");
  await page.getByTestId("nlc-purchase-record").click();
  await expect(page.getByTestId("toast")).toContainText("Added 10 · Rice (50kg bag)");

  await page.getByRole("link", { name: "Stock" }).click();
  await expect(riceRow.getByText(`${before + 10} left`)).toBeVisible();
});

test("credit record routing: 'Aminata owes me 50,000' → receivable via the existing endpoint", async ({ page }) => {
  await signIn(page);
  await openSaleCapture(page);
  await page.getByTestId("nlc-input").fill("Isatu owes me 50,000");
  await page.getByTestId("nlc-fill").click();
  await expect(page.getByTestId("nlc-debt-card")).toContainText("Isatu owes you");
  await expect(page.getByTestId("nlc-debt-card")).toContainText("Le 50,000");
  await page.getByTestId("nlc-debt-record").click();
  await expect(page.getByTestId("toast")).toContainText("Debt recorded · Le 50,000");

  await page.getByRole("link", { name: "Money" }).click();
  await page.getByRole("tab", { name: "Owed to you" }).click();
  await expect(page.getByTestId("debt-card").filter({ hasText: "Isatu" }).filter({ hasText: "Le 50,000" })).toBeVisible();
});

test("ambiguous 'Rice 350' asks sale-or-purchase and never guesses", async ({ page }) => {
  await signIn(page);
  await openSaleCapture(page);
  await page.getByTestId("nlc-input").fill("Rice 350");
  await page.getByTestId("nlc-fill").click();
  await expect(page.getByTestId("nlc-summary")).toContainText("Is this a sale or a purchase?");
  await expect(page.getByTestId("capture-save")).toBeDisabled(); // nothing committed while unresolved
  await page.getByTestId("nlc-intent-sale").click();
  await expect(page.getByTestId("amount-display")).toContainText("350");
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("toast")).toContainText("Saved · Le 350");
});

test("unusual price warns with the business's own price but allows confirm-anyway", async ({ page }) => {
  await signIn(page);
  await openSaleCapture(page);
  await page.getByTestId("nlc-input").fill("Sold 2 bags of rice at 700 each");
  await page.getByTestId("nlc-fill").click();
  await expect(page.getByTestId("nlc-summary")).toContainText("usually around");
  await expect(page.getByTestId("capture-save")).toBeEnabled(); // warning, not rejection
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("toast")).toContainText("Saved · Le 1,400");
});

test("insufficient stock warns with what the records say is left", async ({ page }) => {
  await signIn(page);
  await openSaleCapture(page);
  await page.getByTestId("nlc-input").fill("Sold 500 bags of rice at 350 each");
  await page.getByTestId("nlc-fill").click();
  await expect(page.getByTestId("nlc-summary")).toContainText("left in stock");
  await expect(page.getByTestId("capture-save")).toBeEnabled();
});

test("owner edits the interpretation before confirming (quantity stepper keeps the spoken price)", async ({ page }) => {
  await signIn(page);
  await openSaleCapture(page);
  await page.getByTestId("nlc-input").fill("Sold 3 bags of rice at 350 each");
  await page.getByTestId("nlc-fill").click();
  await expect(page.getByTestId("amount-display")).toContainText("1,050");
  await page.getByRole("button", { name: "+" }).click(); // 3 → 4, at the SPOKEN Le 350
  await expect(page.getByTestId("amount-display")).toContainText("1,400");
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("toast")).toContainText("Saved · Le 1,400");
});

test("owner cancels: interpreted record is discarded, nothing is saved", async ({ page }) => {
  await signIn(page);
  await openSaleCapture(page);
  await page.getByTestId("nlc-input").fill("sold 1 bag of rice at 1313 each");
  await page.getByTestId("nlc-fill").click();
  await expect(page.getByTestId("amount-display")).toContainText("1,313");
  await page.keyboard.press("Escape"); // dirty sheet → discard confirmation
  await page.getByRole("button", { name: "Discard" }).click();

  await page.getByRole("link", { name: "Money" }).click();
  await page.getByRole("tab", { name: "In", exact: true }).click();
  await expect(page.getByTestId("record-card").filter({ hasText: "Le 1,313" })).toHaveCount(0);
});

test("possible duplicate: same amount minutes later warns but still allows a real second sale", async ({ page }) => {
  await signIn(page);
  await openSaleCapture(page);
  await page.getByTestId("nlc-input").fill("sold 2 bar soap at 250 each");
  await page.getByTestId("nlc-fill").click();
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("toast")).toContainText("Saved · Le 500");

  await openSaleCapture(page);
  await page.getByTestId("nlc-input").fill("sold 2 bar soap at 250 each");
  await page.getByTestId("nlc-fill").click();
  await expect(page.getByTestId("nlc-summary")).toContainText("a few minutes ago");
  await expect(page.getByTestId("capture-save")).toBeEnabled(); // confirm-anyway
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("toast")).toContainText("Saved · Le 500");
});

test("voice failure explains the cause: blocked mic vs unreachable speech service", async ({ page }) => {
  await page.addInitScript(() => {
    // First click fails like a blocked mic; second like Brave/offline (network).
    let call = 0;
    class FailingRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      start() {
        call += 1;
        const code = call === 1 ? "not-allowed" : "network";
        setTimeout(() => {
          this.onerror?.({ error: code });
          this.onend?.();
        }, 30);
      }
      stop() {}
    }
    const w = window as unknown as Record<string, unknown>;
    w.SpeechRecognition = FailingRecognition;
    w.webkitSpeechRecognition = FailingRecognition;
  });

  await signIn(page);
  await openSaleCapture(page);
  await page.getByTestId("nlc-mic").click();
  await expect(page.getByTestId("nlc-mic-message")).toContainText("blocking the microphone");
  await page.getByTestId("nlc-mic").click();
  await expect(page.getByTestId("nlc-mic-message")).toContainText("couldn't reach the internet");
  // The typed path is always the recovery: same phrase, same interpreter.
  await page.getByTestId("nlc-input").fill("Ah sell three bag rice for three hundred and fifty each");
  await page.getByTestId("nlc-fill").click();
  await expect(page.getByTestId("nlc-summary")).toContainText("3 × Rice (50kg bag)");
});
