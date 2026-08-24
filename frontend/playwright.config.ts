import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  workers: 1, // tests share the mock server's in-memory state — run serially
  use: {
    baseURL: "http://localhost:3100",
    viewport: { width: 360, height: 640 }, // mobile foundation (Phase 4 §11)
    launchOptions: { executablePath: process.env.MIY_CHROMIUM || undefined },
  },
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://localhost:3100/welcome",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
