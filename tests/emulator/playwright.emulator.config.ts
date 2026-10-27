/**
 * EMULATOR TEST LANE — Playwright config.
 *
 * Owned by the lane only: no global `webServer` (lane.mjs owns Vite so it can
 * teardown deterministically), one worker, no retries, no skips. `serviceWorkers`
 * is blocked and no permissions are granted so a fresh guest context has no
 * notification/push/geolocation capability.
 */
import path from "node:path";

import { defineConfig } from "@playwright/test";

const ARTIFACTS_DIR = process.env.EMULATOR_LANE_ARTIFACTS;
if (!ARTIFACTS_DIR) {
  throw new Error(
    "[playwright.emulator] EMULATOR_LANE_ARTIFACTS is not set. Run `node tests/emulator/run-lane.mjs`.",
  );
}
const phase = process.env.EMULATOR_LANE_PHASE ?? "positive";

export default defineConfig({
  // Relative to this config file.
  testDir: ".",
  testMatch: ["*.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["json", { outputFile: path.join(ARTIFACTS_DIR, `playwright-${phase}.json`) }],
  ],
  outputDir: path.join(ARTIFACTS_DIR, `playwright-output-${phase}`),
  use: {
    baseURL: "http://127.0.0.1:5199",
    serviceWorkers: "block",
    permissions: [],
    reducedMotion: "reduce",
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    viewport: { width: 375, height: 812 },
    trace: "off",
    video: "off",
    screenshot: "off",
    acceptDownloads: false,
  },
});
