import { chromium } from "@playwright/test";

const B = "http://localhost:3000";
const shot = async (page, path) => page.screenshot({ path, fullPage: false });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

await page.goto(B + "/");
await page.getByRole("link", { name: "I have an account" }).click();
await page.getByTestId("signin-identifier").fill("mariama@example.sl");
await page.getByTestId("signin-password").fill("demo-password");
await page.getByTestId("signin-submit").click();
await page.getByTestId("business-name").waitFor();

await page.getByRole("link", { name: "Partner", exact: true }).click();
await page.getByTestId("partner-input").waitFor();
await page.waitForTimeout(500);
await shot(page, "/tmp/partner-modes.png");

// advice answer: records + guidance
await page.getByTestId("partner-input").fill("How can I increase sales?");
await page.getByTestId("partner-send").click();
await page.getByTestId("partner-block-guidance").first().waitFor();
await page.waitForTimeout(700);
await shot(page, "/tmp/partner-advice.png");

// decision support
await page.getByTestId("partner-input").fill("Should I buy more rice?");
await page.getByTestId("partner-send").click();
await page.waitForTimeout(1200);
await shot(page, "/tmp/partner-decision.png");

// research mode, honestly unavailable
await page.getByTestId("partner-mode-web").click();
await page.getByTestId("research-unavailable").waitFor();
await page.getByTestId("partner-input").fill("What is the market price of rice?");
await page.getByTestId("partner-send").click();
await page.waitForTimeout(1200);
await shot(page, "/tmp/partner-research.png");

// Krio
await page.getByTestId("partner-mode-business").click();
await page.getByTestId("partner-input").fill("Sales don slow. Wetin I fit do?");
await page.getByTestId("partner-send").click();
await page.waitForTimeout(1200);
await shot(page, "/tmp/partner-krio.png");

await browser.close();
console.log("shots done");
