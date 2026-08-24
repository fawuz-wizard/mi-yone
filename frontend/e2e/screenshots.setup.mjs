// Dev utility: capture slice screenshots for owner review. Not part of the test suite.
import { chromium } from "@playwright/test";

const exe = process.env.MIY_CHROMIUM;
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2 });

await page.goto("http://localhost:3100/welcome");
await page.screenshot({ path: "/home/claude/shots/1-welcome.png" });

await page.getByRole("link", { name: "Get started" }).click();
await page.getByTestId("signin-identifier").fill("mariama@example.sl");
await page.getByTestId("signin-password").fill("demo");
await page.getByTestId("signin-submit").click();
await page.getByTestId("business-name").waitFor();
await page.waitForTimeout(600);
await page.screenshot({ path: "/home/claude/shots/2-home.png" });

await page.getByTestId("fab-add").click();
await page.waitForTimeout(300);
await page.getByTestId("choose-money-in").click();
for (const d of ["4", "5", "0", "0", "0"]) {
  await page.getByRole("button", { name: d, exact: true }).click();
}
await page.waitForTimeout(200);
await page.screenshot({ path: "/home/claude/shots/3-capture-sale.png" });
await page.getByTestId("capture-save").click();
await page.getByTestId("toast").waitFor();
await page.screenshot({ path: "/home/claude/shots/4-saved-toast.png" });

await page.getByRole("link", { name: "Money" }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: "/home/claude/shots/5-money.png" });

await browser.close();
console.log("screenshots done");
