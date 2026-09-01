// Partner AI — advisor + market research E2E (owner brief).
// The rules on trial: three knowledge lanes, each labelled on screen; guidance
// never carries figures; research is honestly unavailable rather than invented;
// Krio advice questions behave exactly like their English twins.
// Runs unchanged against the mock AND the real backend.
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

async function openPartner(page: Page) {
  await page.getByRole("link", { name: "Partner", exact: true }).click();
  await expect(page.getByTestId("partner-input")).toBeVisible();
}

async function ask(page: Page, text: string) {
  await page.getByTestId("partner-input").fill(text);
  await page.getByTestId("partner-send").click();
  await expect(page.getByTestId("partner-msg-reply").last()).toBeVisible();
}

test("advice combines the owner's records with guidance — each labelled separately", async ({ page }) => {
  await signIn(page);
  await openPartner(page);
  await ask(page, "How can I increase sales?");
  const reply = page.getByTestId("partner-msg-reply").last();
  // Both lanes present, and visibly distinct.
  await expect(reply.getByTestId("partner-block-records").first()).toBeVisible();
  await expect(reply.getByTestId("partner-block-guidance").first()).toBeVisible();
  await expect(reply).toContainText("From your records");
  await expect(reply).toContainText("General business guidance");
  // The Partner's own "ask me to research it" note is not a record.
  await expect(reply.getByTestId("partner-block-note")).not.toContainText("From your records");
  // Guidance is practice, not market claims.
  await expect(reply.getByTestId("partner-block-guidance").first()).not.toContainText("%");
});

test("Krio advice questions behave exactly like English ones", async ({ page }) => {
  await signIn(page);
  await openPartner(page);
  await ask(page, "Sales don slow. Wetin I fit do?");
  const reply = page.getByTestId("partner-msg-reply").last();
  await expect(reply.getByTestId("partner-block-guidance").first()).toBeVisible();
  await expect(reply).toContainText("General business guidance");
});

test("decision support weighs the records and leaves the call to the owner", async ({ page }) => {
  await signIn(page);
  await openPartner(page);
  await ask(page, "Should I buy more rice?");
  const reply = page.getByTestId("partner-msg-reply").last();
  await expect(reply).toContainText("Weighing it up");
  await expect(reply.getByTestId("partner-block-guidance").first()).toBeVisible();
});

test("market research is honestly unavailable — no invented prices, no fake sources", async ({ page }) => {
  await signIn(page);
  await openPartner(page);
  await page.getByTestId("partner-mode-web").click();
  // The owner is told the truth before they ask, not after.
  await expect(page.getByTestId("research-unavailable")).toBeVisible();
  await ask(page, "What is the market price of rice?");
  const reply = page.getByTestId("partner-msg-reply").last();
  await expect(reply).toContainText("can't verify that information right now");
  await expect(reply.getByTestId("partner-sources")).toHaveCount(0);
  await expect(reply.getByTestId("partner-block-web")).toHaveCount(0);
  // Saying "I can't" is a note about the Partner, not guidance dressed up.
  const note = reply.getByTestId("partner-block-note");
  await expect(note).toBeVisible();
  // And it carries NO provenance label — it is not a knowledge claim. This
  // caught a real defect: the note was labelled "From your records".
  await expect(note).not.toContainText("From your records");
  await expect(note).not.toContainText("General business guidance");
});

test("an unanswerable market question still offers what the records DO know", async ({ page }) => {
  await signIn(page);
  await openPartner(page);
  await ask(page, "What products are people buying more?");
  const reply = page.getByTestId("partner-msg-reply").last();
  await expect(reply).toContainText("your own shop");
  await expect(reply.getByTestId("partner-block-records").first()).toBeVisible();
});

test("business questions are unchanged: records only, no guidance bleeding in", async ({ page }) => {
  await signIn(page);
  await openPartner(page);
  await ask(page, "Who owes me money?");
  const reply = page.getByTestId("partner-msg-reply").last();
  await expect(reply.getByTestId("partner-block-records").first()).toBeVisible();
  await expect(reply.getByTestId("partner-block-guidance")).toHaveCount(0);
  await expect(reply.getByTestId("partner-block-web")).toHaveCount(0);
});

test("the Partner screen with all three lane styles passes accessibility", async ({ page }) => {
  await signIn(page);
  await openPartner(page);
  await ask(page, "How can I reduce expenses?");
  await page.getByTestId("partner-mode-web").click();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});
