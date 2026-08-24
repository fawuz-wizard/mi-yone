// Dev utility: milestone-2 screenshots. Not part of the test suite.
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ executablePath: process.env.MIY_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2 });

await page.goto("http://localhost:3100/welcome");
await page.getByRole("link", { name: "Get started" }).click();
await page.getByTestId("signin-identifier").fill("mariama@example.sl");
await page.getByTestId("signin-password").fill("demo");
await page.getByTestId("signin-submit").click();
await page.getByTestId("business-name").waitFor();
await page.waitForTimeout(600);
await page.screenshot({ path: "/home/claude/shots/m2-1-home-attention.png" });

await page.getByTestId("fab-add").click();
await page.getByTestId("choose-money-in").click();
await page.getByRole("radio", { name: /Rice/ }).click();
await page.getByTestId("payment-owes").click();
await page.getByRole("radio", { name: /Aminata/ }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: "/home/claude/shots/m2-2-capture-credit.png", fullPage: false });
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Discard" }).click();

await page.getByRole("link", { name: "Money" }).click();
await page.getByRole("tab", { name: "Owed to you" }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: "/home/claude/shots/m2-3-owed.png" });

const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
await desktop.goto("http://localhost:3100/welcome");
await desktop.getByRole("link", { name: "Get started" }).click();
await desktop.getByTestId("signin-identifier").fill("m@x.sl");
await desktop.getByTestId("signin-password").fill("d");
await desktop.getByTestId("signin-submit").click();
await desktop.waitForTimeout(700);
await desktop.goto("http://localhost:3100/money");
await desktop.waitForTimeout(700);
await desktop.screenshot({ path: "/home/claude/shots/m2-4-desktop-table.png" });

await browser.close();
console.log("done");
