// Dev utility: transactions-milestone screenshots. Not part of the test suite.
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ executablePath: process.env.MIY_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });

await page.goto("http://localhost:3100/welcome");
await page.getByRole("link", { name: "Get started" }).click();
await page.getByTestId("signin-identifier").fill("mariama@example.sl");
await page.getByTestId("signin-password").fill("demo");
await page.getByTestId("signin-submit").click();
await page.getByTestId("business-name").waitFor();
await page.waitForTimeout(500);

// Expense capture with category chips + date
await page.getByTestId("fab-add").click();
await page.getByTestId("choose-money-out").click();
for (const d of ["7", "3", "0", "0", "0"]) await page.getByRole("button", { name: d, exact: true }).click();
await page.getByRole("radio", { name: "Transport" }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: "/home/claude/shots/m4-1-expense-category.png" });
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Discard" }).click();

// Money with filters
await page.getByRole("link", { name: "Money" }).click();
await page.getByRole("tab", { name: "Out", exact: true }).click();
await page.waitForTimeout(400);
await page.getByRole("radio", { name: "Stock purchase" }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: "/home/claude/shots/m4-2-money-filters.png" });

// Record detail with Fix + Remove
await page.getByTestId("record-card").first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: "/home/claude/shots/m4-3-detail-actions.png" });

await browser.close();
console.log("done");
