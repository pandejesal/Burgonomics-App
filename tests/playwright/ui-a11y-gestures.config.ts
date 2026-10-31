import { defineConfig, devices } from "@playwright/test";

/**
 * Real-browser acceptance config for the customer app's gesture surface.
 *
 * Deliberately self-contained: no dev server, no Firebase env, no ports. The
 * spec bundles the SHIPPED gesture utility and drives it over file:// with
 * Chromium touch events. Plain `npx playwright test` never auto-discovers this
 * non-default config name.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "**/ui-a11y-gestures.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    // A service worker would serve requests that `page.route` never sees.
    serviceWorkers: "block",
  },
});
