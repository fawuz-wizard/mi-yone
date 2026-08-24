// Dev utility: reports screenshots. Not part of the test suite.
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ executablePath: process.env.MIY_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 360, height: 900 }, deviceScaleFactor: 2 });

await page.goto("http://localhost:3100/welcome");
await page.getByRole("link", { name: "Get started" }).click();
await page.getByTestId("signin-identifier").fill("mariama@example.sl");
await page.getByTestId("signin-password").fill("demo");
await page.getByTestId("signin-submit").click();
await page.getByTestId("business-name").waitFor();
await page.goto("http://localhost:3100/insights");
await page.waitForTimeout(700);
await page.screenshot({ path: "/home/claude/shots/m7-1-report-top.png" });
await page.evaluate(() => window.scrollBy(0, 700));
await page.waitForTimeout(200);
await page.screenshot({ path: "/home/claude/shots/m7-2-report-bottom.png" });

// The print/PDF rendition
await page.emulateMedia({ media: "print" });
await page.pdf({ path: "/home/claude/shots/mi-yone-report-sample.pdf", format: "A4" }).catch(() => {});
await browser.close();
console.log("done");
