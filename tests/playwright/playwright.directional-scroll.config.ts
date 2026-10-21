import { defineConfig, devices } from "@playwright/test";

/**
 * Real-browser config for the shared directional-scroll hook.
 *
 * Self-contained on purpose: no dev server, no Firebase env, no ports. The spec
 * bundles the SHIPPED `src/shared/hooks/useDirectionalScroll.ts` (plus React)
 * at test time and drives it over file:// with Chromium's real touch pipeline.
 *
 * Run it explicitly by config path (this app declares no Playwright dependency;
 * the runner resolves from the workspace root):
 *
 *   npx --no-install playwright test -c tests/playwright/playwright.directional-scroll.config.ts
 *
 * A bare `npx playwright test` from this directory does NOT read this file: no
 * `playwright.config.ts` exists here, so Playwright's default testMatch would
 * collect this spec with the wrong `use` block (no touch, desktop viewport).
 */
export default defineConfig({
  testDir: ".",
  testMatch: "**/ui-directional-scroll.spec.ts",
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
    serviceWorkers: "block",
  },
});
