/**
 * Scoped Vitest config for the emulator lane's pure tests.
 *
 * - cacheDir lives in TEMP, so running these tests never mutates the shared /
 *   junctioned `node_modules/.vite` cache;
 * - only `tests/emulator/*.test.ts` is collected (never the Playwright specs);
 * - no setup file: these tests must not inherit app/DOM mocks.
 */
import os from "node:os";
import path from "node:path";

import { defineConfig } from "vitest/config";

const artifacts =
  process.env.EMULATOR_LANE_ARTIFACTS ??
  path.join(os.tmpdir(), "opencode", "phase1-emulator-followup");

export default defineConfig({
  cacheDir: path.join(artifacts, "vitest-cache"),
  test: {
    include: ["tests/emulator/*.test.ts"],
    environment: "node",
    setupFiles: [],
  },
});
