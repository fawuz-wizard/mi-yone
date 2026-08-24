// Dev utility: stock-milestone screenshots. Not part of the test suite.
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ executablePath: process.env.MIY_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });

await page.goto("http://localhost:3100/welcome");
await page.getByRole("link", { name: "Get started" }).click();
await page.getByTestId("signin-identifier").fill("mariama@example.sl");
await page.getByTestId("signin-password").fill("demo");
await page.getByTestId("signin-submit").click();
await page.getByTestId("business-name").waitFor();
await page.waitForTimeout(400);

await page.getByRole("link", { name: "Stock" }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: "/home/claude/shots/m5-1-stock-list.png" });

await page.getByTestId("product-row").filter({ hasText: "Rice" }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: "/home/claude/shots/m5-2-product-detail.png" });

await page.getByTestId("add-stock").click();
await page.getByLabel("How many?").fill("10");
await page.getByTestId("stock-owe").click();
await page.waitForTimeout(300);
await page.screenshot({ path: "/home/claude/shots/m5-3-add-stock.png" });

await browser.close();
console.log("done");
