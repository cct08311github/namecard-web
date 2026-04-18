import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 14"] },
    },
  ],
  webServer: process.env.CI
    ? {
        // E2E_TEST_MODE is set by the emulator-backed e2e-crud CI job,
        // which pre-builds outside `firebase emulators:exec` and just needs
        // `pnpm start` here. Plain e2e (auth-gate) still wants build+start.
        command: process.env.E2E_TEST_MODE === "1" ? "pnpm start" : "pnpm build && pnpm start",
        url: baseURL,
        reuseExistingServer: false,
        timeout: 180_000,
      }
    : {
        command: "pnpm dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
