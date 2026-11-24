/**
 * requestOtp must never leave the customer on a spinner. When
 * `signInWithPhoneNumber` does not settle (the reCAPTCHA widget was never
 * solved, is off-screen, or the challenge is blocked), the request ends after
 * AUTH_REQUEST_DEADLINE_MS with authored copy instead of hanging forever.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isAuthoredAuthMessage, authCopy } from "../src/features/auth/utils/authErrors";

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
  isFlowSolved,
  type RecaptchaFactory,
} from "../src/features/auth/state/authBinding";
import {
  authService,
  AUTH_REQUEST_DEADLINE_MS,
  RECAPTCHA_RENDER_DEADLINE_MS,
} from "../src/features/auth/services/authService";
import type { RecaptchaVerifier } from "firebase/auth";

/** Records the verifier's callbacks so a test can "solve" the widget. */
function fakeFactory(
  onCreate?: (params: { callback: () => void }) => void,
  render?: () => Promise<number>,
  verify?: () => Promise<string>,
): RecaptchaFactory {
  return (_auth, _element, parameters) => {
    onCreate?.(parameters as unknown as { callback: () => void });
    return {
      clear: vi.fn(),
      render: vi.fn().mockImplementation(render ?? (() => Promise.resolve(0))),
      verify: vi.fn().mockImplementation(
        verify ??
          (async () => {
            parameters.callback();
            return "verified-token";
          }),
      ),
    } as unknown as RecaptchaVerifier;
  };
}

describe("requestOtp deadline", () => {
  let element: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    __resetAuthBindingsForTests();
    element = document.createElement("div");
    document.body.append(element);
  });

  afterEach(() => {
    __resetAuthBindingsForTests();
    __setRecaptchaFactoryForTests(null);
    element.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("is 60 seconds", () => {
    expect(AUTH_REQUEST_DEADLINE_MS).toBe(60_000);
  });

  it("an uncompleted invisible check ends with retry copy, not a spinner", async () => {
    __setRecaptchaFactoryForTests(fakeFactory(undefined, undefined, () => new Promise(() => {})));
    bindHost("login", "host-unsolved", element);
    sdk.sendSms.mockImplementation(async (_auth, _phone, verifier: RecaptchaVerifier) => {
      await verifier.verify();
      return new Promise(() => {});
    });

    const resultPromise = authService.requestOtp("9876543210", "sms", undefined, "login");
    await vi.advanceTimersByTimeAsync(AUTH_REQUEST_DEADLINE_MS + 100);
    const result = await resultPromise;
    expect(sdk.sendSms).toHaveBeenCalledTimes(1);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("AUTH_CAPTCHA_TIMEOUT");
      expect(result.error.message).toBe(authCopy("AUTH_CAPTCHA_TIMEOUT"));
      expect(result.error.message).not.toContain("tick the box");
      expect(isAuthoredAuthMessage(result.error.message)).toBe(true);
    }
  });

  it("a verified challenge that still does not settle reports an unknown outcome", async () => {
    __setRecaptchaFactoryForTests(fakeFactory());
    bindHost("login", "host-solved", element);

    sdk.sendSms.mockImplementation(async (_auth, _phone, verifier: RecaptchaVerifier) => {
      await verifier.verify();
      return new Promise(() => {});
    });

    const resultPromise = authService.requestOtp("9876543210", "sms", undefined, "login");
    await vi.advanceTimersByTimeAsync(AUTH_REQUEST_DEADLINE_MS + 100);
    const result = await resultPromise;
    expect(isFlowSolved("login")).toBe(false);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("AUTH_LAST_ATTEMPT_UNKNOWN");
      expect(result.error.message).toBe(authCopy("AUTH_LAST_ATTEMPT_UNKNOWN"));
      expect(isAuthoredAuthMessage(result.error.message)).toBe(true);
    }
  });

  it("a render that never settles fails fast instead of hanging before the deadline", async () => {
    __setRecaptchaFactoryForTests(fakeFactory(undefined, () => new Promise<number>(() => {})));
    bindHost("login", "host-render-hang", element);
    sdk.sendSms.mockResolvedValue({ confirm: vi.fn() });

    const resultPromise = authService.requestOtp("9876543210", "sms", undefined, "login");
    await vi.advanceTimersByTimeAsync(RECAPTCHA_RENDER_DEADLINE_MS + 100);
    const result = await resultPromise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("RECAPTCHA_RENDER_FAILED");
      expect(isAuthoredAuthMessage(result.error.message)).toBe(true);
    }
    // The SMS call must never be attempted when the widget cannot render.
    expect(sdk.sendSms).not.toHaveBeenCalled();
  });

  it("clears its deadline timer on a fast success (no dangling rejection)", async () => {
    __setRecaptchaFactoryForTests(fakeFactory());
    bindHost("login", "host-fast", element);
    sdk.sendSms.mockImplementation(async (_auth, _phone, verifier: RecaptchaVerifier) => {
      await verifier.verify();
      return { confirm: vi.fn() };
    });

    const result = await authService.requestOtp("9876543210", "sms", undefined, "login");

    expect(result.success).toBe(true);
    expect(isFlowSolved("login")).toBe(true);
    // Only the reCAPTCHA/other SDK timers may remain; ours must be gone.
    const pending = vi.getTimerCount();
    await vi.advanceTimersByTimeAsync(AUTH_REQUEST_DEADLINE_MS * 2);
    expect(vi.getTimerCount()).toBeLessThanOrEqual(pending);
  });
});
