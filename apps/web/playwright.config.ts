import { defineConfig, devices } from "@playwright/test";

// Runs against a real dev server + the real local Postgres (see
// CLAUDE.md's "Local dev environment" note) — not a mock backend. Each
// spec is responsible for using unique data (e.g. a randomized email) so
// repeat runs don't collide with rows a previous run left behind.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
