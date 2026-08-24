// Dev utility: performance-chart screenshots. Not part of the test suite.
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ executablePath: process.env.MIY_CHROMIUM });

async function login(page) {
  await page.goto("http://localhost:3100/welcome");
  await page.getByRole("link", { name: "Get started" }).click();
  await page.getByTestId("signin-identifier").fill("mariama@example.sl");
  await page.getByTestId("signin-password").fill("demo");
  await page.getByTestId("signin-submit").click();
  await page.getByTestId("business-name").waitFor().catch(() => {});
  await page.waitForTimeout(800);
}

const mobile = await browser.newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
await login(mobile);
await mobile.getByTestId("perf-chart").waitFor();
await mobile.getByTestId("perf-chart").scrollIntoViewIfNeeded();
await mobile.waitForTimeout(300);
// hover to show the crosshair tooltip in the shot
const box = await mobile.getByTestId("perf-chart").boundingBox();
await mobile.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.5);
await mobile.waitForTimeout(200);
await mobile.screenshot({ path: "/home/claude/shots/m3-1-chart-mobile.png" });

await mobile.getByRole("tab", { name: "1Y" }).click();
await mobile.waitForTimeout(600);
await mobile.screenshot({ path: "/home/claude/shots/m3-2-chart-1y.png" });

const desktop = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
await login(desktop);
await desktop.getByTestId("perf-chart").waitFor();
await desktop.waitForTimeout(400);
await desktop.screenshot({ path: "/home/claude/shots/m3-3-chart-desktop.png" });

await browser.close();
console.log("done");
