/**
 * Startup-time budget: the branded splash hold lengths.
 *
 * EMULATOR audit 2026-11-26 measured 20-23 s cold starts on a saturated host.
 * The app's own avoidable contribution is the duplicated branded pause: the
 * native Capacitor splash already shows the brand while the bundle loads, so
 * the in-app `SplashPage` used to add another full 1.5 s on top of it.
 *
 * The hold is shortened on native, NOT removed, and the native splash keeps
 * `launchAutoHide: false` — the user still never sees a blank frame.
 */
import { describe, expect, it } from "vitest";

import { SPLASH_HOLD_MS, SPLASH_HOLD_MS_NATIVE, splashHoldMs } from "./splashHold";

describe("splash hold", () => {
  it("keeps the full branded hold on the web", () => {
    expect(splashHoldMs(false)).toBe(SPLASH_HOLD_MS);
    expect(SPLASH_HOLD_MS).toBe(1500);
  });

  it("hands over from the native splash quickly instead of re-showing the brand", () => {
    expect(splashHoldMs(true)).toBe(SPLASH_HOLD_MS_NATIVE);
    // Long enough to avoid a flash between the native splash and the first
    // route paint; short enough to matter against a 20 s cold start.
    expect(SPLASH_HOLD_MS_NATIVE).toBeGreaterThanOrEqual(150);
    expect(SPLASH_HOLD_MS_NATIVE).toBeLessThanOrEqual(500);
  });
});
