import { defineConfig, devices } from "@playwright/test";

/**
 * Real-browser sticky-scrollport regression, keyed to a SERVED production
 * `dist`. `@playwright/test` is a declared devDependency (1.63.0); the config
 * resolves from this app on a clean `npm ci`.
 *
 * Root cause under test: `html, body { overflow-x: hidden }` (src/styles.css)
 * forced `overflow-y` from `visible` to `auto`, making html AND body scroll
 * containers. Sticky descendants (`header.top-0.z-30`, `form` at 56px) then
 * pinned against a scrollport that never scrolled and scrolled away with the
 * document. The fix is root-only `overflow-x: clip` with a root-only `hidden`
 * fallback, leaving `body` overflow `visible`.
 *
 * Run against an already-served production build:
 *
 *   $env:UI_BASE_URL = "http://127.0.0.1:5194"
 *   npx playwright test -c tests/playwright/playwright.sticky-scroll.config.ts
 *   Remove-Item Env:\UI_BASE_URL
 *
 * Gate policy:
 *   - Without `UI_BASE_URL` the suite is an explicit local SKIP (never a pass).
 *   - With `CI=1` or `UI_GATE_REQUIRED=1` a missing URL is a hard FAIL.
 *   - `forbidOnly` in CI prevents a focused `.only` from masquerading as a full
 *     gate.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "**/sticky-scrollport.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 7_000 },
  use: {
    ...devices["Desktop Chrome"],
    // Mobile-first surfaces: 320x568 (iPhone SE class) through 1280x800.
    hasTouch: true,
    serviceWorkers: "block",
  },
});
