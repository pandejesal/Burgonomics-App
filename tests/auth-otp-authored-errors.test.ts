/**
 * Every auth failure that reaches the customer must be copy this app authored.
 * Firebase provider text can embed the phone number and is never readable, so a
 * mapping that falls back to `error.message` is a PII leak as well as bad copy.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isAuthoredAuthMessage } from "../src/features/auth/utils/authErrors";

const sdk = vi.hoisted(() => ({
  sendSms: vi.fn(),
}));

vi.mock("firebase/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/auth")>();
  return { ...actual, signInWithPhoneNumber: sdk.sendSms };
});

import {
  __resetAuthBindingsForTests,
  __setRecaptchaFactoryForTests,
  bindHost,
} from "../src/features/auth/state/authBinding";
import { authService } from "../src/features/auth/services/authService";
import type { RecaptchaVerifier } from "firebase/auth";

const PHONE = "9876543210";

function fakeVerifier() {
  return {
    clear: vi.fn(),
    render: vi.fn().mockResolvedValue(0),
  } as unknown as RecaptchaVerifier;
}

function firebaseError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

describe("requestOtp authored error messages", () => {
  let element: HTMLDivElement;

  beforeEach(() => {
    __resetAuthBindingsForTests();
    __setRecaptchaFactoryForTests(() => fakeVerifier());
    element = document.createElement("div");
    document.body.append(element);
    bindHost("login", "test-host", element, () => 320);
  });

  afterEach(() => {
    __resetAuthBindingsForTests();
    __setRecaptchaFactoryForTests(null);
    element.remove();
    vi.restoreAllMocks();
  });

  const cases: Array<[string, string]> = [
    ["auth/unauthorized-domain", "AUTH_DOMAIN_NOT_AUTHORIZED"],
    ["auth/operation-not-allowed", "AUTH_PHONE_SIGNIN_DISABLED"],
    ["auth/missing-app-credential", "AUTH_APP_NOT_AUTHORIZED"],
    ["auth/app-not-authorized", "AUTH_APP_NOT_AUTHORIZED"],
    ["auth/invalid-app-credential", "AUTH_CAPTCHA_FAILED"],
    ["auth/too-many-requests", "AUTH_TOO_MANY_REQUESTS"],
  ];

  for (const [providerCode, expectedCode] of cases) {
    it(`maps ${providerCode} to ${expectedCode} with authored copy`, async () => {
      sdk.sendSms.mockRejectedValue(
        firebaseError(
          providerCode,
          `Firebase: Error (${providerCode}). Phone ${PHONE} could not be verified.`,
        ),
      );

      const result = await authService.requestOtp(PHONE, "sms", undefined, "login");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(expectedCode);
        expect(isAuthoredAuthMessage(result.error.message)).toBe(true);
        expect(result.error.message).not.toContain(PHONE);
        expect(result.error.message).not.toContain("+91");
        expect(result.error.message).not.toContain("Firebase");
      }
    });
  }

  it("falls back to authored copy for an unknown error, never the provider text", async () => {
    sdk.sendSms.mockRejectedValue(new Error(`some internal thing with +91${PHONE}`));

    const result = await authService.requestOtp(PHONE, "sms", undefined, "login");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("AUTH_OTP_REQUEST_FAILED");
      expect(isAuthoredAuthMessage(result.error.message)).toBe(true);
      expect(result.error.message).not.toContain(PHONE);
    }
  });
});

describe("verifyOtp authored error messages", () => {
  let element: HTMLDivElement;

  beforeEach(async () => {
    __resetAuthBindingsForTests();
    __setRecaptchaFactoryForTests(() => fakeVerifier());
    element = document.createElement("div");
    document.body.append(element);
    bindHost("login", "test-host-verify", element, () => 320);
  });

  afterEach(() => {
    __resetAuthBindingsForTests();
    __setRecaptchaFactoryForTests(null);
    element.remove();
    vi.restoreAllMocks();
  });

  it("returns authored copy when the code is rejected", async () => {
    sdk.sendSms.mockResolvedValue({
      confirm: vi
        .fn()
        .mockRejectedValue(
          firebaseError(
            "auth/invalid-verification-code",
            `Firebase: Error (auth/invalid-verification-code). Code wrong for +91${PHONE}.`,
          ),
        ),
    });

    const requested = await authService.requestOtp(PHONE, "sms", undefined, "login");
    expect(requested.success).toBe(true);

    const verified = await authService.verifyOtp(`+91${PHONE}`, "000000");

    expect(verified.success).toBe(false);
    if (!verified.success) {
      expect(verified.error.code).toBe("AUTH_INVALID_CODE");
      expect(isAuthoredAuthMessage(verified.error.message)).toBe(true);
      expect(verified.error.message).not.toContain(PHONE);
      expect(verified.error.message).not.toContain("Firebase");
    }
  });
});
