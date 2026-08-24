// Dev utility: parties-milestone screenshots. Not part of the test suite.
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

await page.getByRole("link", { name: "Menu" }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: "/home/claude/shots/m6-1-menu.png" });

await page.getByRole("link", { name: /Customers/ }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: "/home/claude/shots/m6-2-customers.png" });

await page.getByTestId("party-row").filter({ hasText: "Aminata" }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: "/home/claude/shots/m6-3-customer-detail.png" });

await browser.close();
console.log("done");
