/**
 * EMULATOR TEST LANE — negative probe (runs with the emulator DOWN).
 *
 * Purpose: prove the lane fails closed and the app has no production fallback.
 * This spec PASSES only when the app shows no synthetic catalogue and makes zero
 * non-loopback requests while the Firestore emulator is unreachable. `lane.mjs
 * --negative` additionally runs the real catalogue spec and requires it to FAIL,
 * so a green negative run can never be mistaken for a catalog proof.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { ARTIFACTS_DIR, FIRESTORE_PORT, installNetworkGuard } from "./lane-fixture";

test("unreachable emulator: no synthetic data, no production fallback, no external traffic", async ({
  page,
}) => {
  const guard = await installNetworkGuard(page);

  await page.goto("/");
  await expect(page).toHaveURL(/\/stores$/, { timeout: 25_000 });

  // Give the SDK time to attempt its loopback connection and fail.
  await page.waitForTimeout(8_000);

  // No seeded record may ever render without the emulator.
  await expect(page.getByText(/EMULATOR ONLY — Test Kitchen/)).toHaveCount(0);
  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toContain("Test Burger");
  expect(bodyText).not.toContain("Test Kitchen");

  // The connector still ran and targeted 8099 — it did not silently retarget prod.
  const lane = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__EMULATOR_LANE__,
  );
  expect(lane).toBeTruthy();
  expect((lane as { port?: number }).port).toBe(FIRESTORE_PORT);
  expect((lane as { host?: string }).host).toBe("127.0.0.1");

  // Honest state: loading, or the empty "No stores found" state. Never fake rows.
  const loading = await page.locator('[aria-label="Loading stores"]').count();
  const empty = await page.getByText("No stores found").count();
  expect(loading + empty, "expected a loading or honest empty state").toBeGreaterThan(0);

  guard.assertClean("negative-probe");
  guard.assertNoPii();
  const unexpectedExternal = guard.requests.filter(
    (url) => !url.includes("127.0.0.1") && !/^https?:\/\/www\.google\.com\/images\/cleardot\.gif/.test(url),
  );
  expect(unexpectedExternal, "no production host may be contacted").toEqual([]);

  // Evidence: every recorded request plus the one tolerated Closure connectivity
  // probe (image, no project data) that the SDK fires when the backend is down.
  writeFileSync(
    path.join(ARTIFACTS_DIR, "negative-network-proof.json"),
    `${JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        firestoreEmulator: `127.0.0.1:${FIRESTORE_PORT} (stopped)`,
        allowedClosureProbes: guard.allowedProbes,
        blockedAttempts: guard.blocked,
        requests: guard.requests,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(
    `[negative-probe] allowed Closure probes=${guard.allowedProbes.length} blocked=${guard.blocked.length} requests=${guard.requests.length}`,
  );
});
