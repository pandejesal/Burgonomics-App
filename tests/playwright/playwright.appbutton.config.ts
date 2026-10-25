import { defineConfig, devices } from "@playwright/test";

/**
 * Dedicated B02 config for the AppButton submit harness.
 *
 * The harness is a static file:// page, so there is deliberately NO
 * webServer: nothing to collide with A02's port 4175 or the root config's
 * 5173/5174. The non-default config name keeps plain `npx playwright test`
 * (auto-discovery) from ever picking this suite up.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "app-button-submit.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    ...devices["Desktop Chrome"],
  },
});
