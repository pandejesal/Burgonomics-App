/**
 * CUS-08 — Razorpay publishable keys in an explicit staging build.
 *
 * Staging is built with `npm run build:mobile:staging` → `--mode staging`: a
 * RELEASE bundle (PROD=true) that legitimately runs on a Razorpay TEST key
 * (staging cannot move real money). The old gate treated every release bundle
 * as production and refused `rzp_test_*`, so online payment could not work on
 * staging. The fix adds one narrow build fact — `isStagingBuild()` reads
 * `import.meta.env.MODE === "staging"` — used only by the publishable-key
 * gates. Production behaviour is unchanged; a LIVE key on staging is refused.
 *
 * The build-mode inputs are pure parameters here because `import.meta.env` is
 * frozen per module at transform time; the adapter/`env.ts` feed these same
 * functions the real values at module init.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isUsableKeyId, testKeysAllowedForBuild } from "./razorpayAdapter";
import { isStagingBuild, razorpayKeyVerdict } from "@/core/config/env";

const PROD_MESSAGE =
  "[burgonomics] FATAL: Production build is using a Razorpay TEST key or has no key configured. " +
  "Set VITE_RAZORPAY_KEY_ID to a live key before shipping.";

/** A release bundle that is NOT staging: `vite build` (no flag) or --mode production. */
const releaseContext = (staging: boolean) => ({
  testRunner: false,
  staging,
  dev: false,
  productionBuild: true,
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env.VITEST = "true";
  process.env.NODE_ENV = "test";
});

describe("CUS-08 — test keys are accepted only in an explicit staging build", () => {
  it("production mode refuses rzp_test_ keys exactly as before", () => {
    expect(isStagingBuild("production")).toBe(false);
    expect(testKeysAllowedForBuild(releaseContext(false))).toBe(false);
    expect(razorpayKeyVerdict("rzp_test_prod_refused", { staging: false, productionGate: true })).toEqual({
      level: "error",
      message: PROD_MESSAGE,
    });
  });

  it("a build with no --mode flag is not staging (vite resolves it to production)", () => {
    // `vite build` with no --mode flag resolves MODE to "production"; an absent
    // value must never be read as staging.
    expect(isStagingBuild("production")).toBe(false);
    expect(isStagingBuild(undefined)).toBe(false);
    expect(testKeysAllowedForBuild(releaseContext(false))).toBe(false);
  });

  it("staging mode accepts rzp_test_ keys", () => {
    expect(isStagingBuild("staging")).toBe(true);
    expect(testKeysAllowedForBuild(releaseContext(true))).toBe(true);
    expect(razorpayKeyVerdict("rzp_test_staging_ok", { staging: true, productionGate: true })).toEqual({
      level: "ok",
    });
  });

  it("staging mode does not accept a LIVE key (refused at boot)", () => {
    const verdict = razorpayKeyVerdict("rzp_live_cus08", { staging: true, productionGate: true });
    expect(verdict.level).toBe("error");
    expect(verdict.message).toMatch(/Staging build is using a Razorpay LIVE key/);
    // Distinct rule: the production test-key message must not be what fires.
    expect(verdict.message).not.toBe(PROD_MESSAGE);
  });

  it("the placeholder sentinel is refused in every build mode", () => {
    // The sentinel is tolerated ONLY inside a test runner — no build mode
    // (staging included) turns it into a usable key.
    delete process.env.VITEST;
    process.env.NODE_ENV = "production";
    expect(isUsableKeyId("rzp_test_placeholder")).toBe(false);
    process.env.NODE_ENV = "test";
    expect(isUsableKeyId("rzp_test_placeholder")).toBe(true);
  });

  it("isProductionBuild behaviour is unchanged: staging does not relax it", () => {
    // A staging bundle IS a production build (PROD=true) — the new flag only
    // opens the test-key gate, it does not make the build "not production".
    expect(testKeysAllowedForBuild(releaseContext(true))).toBe(true);
    expect(testKeysAllowedForBuild(releaseContext(false))).toBe(false);
    // VITE_APP_ENV is never consulted, so it cannot unlock a test key.
    expect(testKeysAllowedForBuild({ ...releaseContext(false), dev: false })).toBe(false);
  });
});
