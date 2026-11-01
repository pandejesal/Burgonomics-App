import { describe, expect, it } from "vitest";
import { assertReleaseConfig } from "../scripts/release-config";
const valid = { VITE_APP_ENV: "production", VITE_RAZORPAY_KEY_ID: "rzp_live_abcdef123456", VITE_API_BASE_URL: "https://api.burgonomics.com", VITE_PAYMENTS_API_BASE_URL: "https://api.burgonomics.com/payments" };
describe("release configuration", () => {
 it.each(["", "rzp_test_abcdef123456", "rzp_live_..."])("production rejects missing/test/placeholder key %s", key => {
  expect(() => assertReleaseConfig("production", { ...valid, VITE_RAZORPAY_KEY_ID: key })).toThrow(/VITE_RAZORPAY_KEY_ID/);
 });
 it("accepts production live inputs", () => expect(() => assertReleaseConfig("production", valid)).not.toThrow());
 it("staging still accepts test keys", () => expect(() => assertReleaseConfig("staging", { VITE_RAZORPAY_KEY_ID: "rzp_test_abcdef123456" })).not.toThrow());
 it("staging rejects live keys", () => expect(() => assertReleaseConfig("staging", valid)).toThrow(/LIVE/));
 it("production refuses fixture API", () => expect(() => assertReleaseConfig("production", { ...valid, VITE_API_BASE_URL: "https://api.burgonomics.example" })).toThrow(/HTTPS/));
});
