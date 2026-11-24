// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { RecaptchaVerifier } from "firebase/auth";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sdk = vi.hoisted(() => ({
  sendSms: vi.fn(),
  construct: vi.fn(),
  parameters: undefined as Record<string, unknown> | undefined,
}));

vi.mock("firebase/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/auth")>();
  return {
    ...actual,
    signInWithPhoneNumber: sdk.sendSms,
    RecaptchaVerifier: class {
      parameters: Record<string, unknown>;
      clear = vi.fn();
      render = vi.fn(async () => 0);
      verify = vi.fn(async () => "verified-token");
      constructor(_auth: unknown, _container: unknown, parameters: Record<string, unknown>) {
        this.parameters = parameters;
        sdk.construct();
        sdk.parameters = parameters;
      }
    },
  };
});

import {
  __resetAuthBindingsForTests,
  __setRecaptchaFactoryForTests,
  acquireForFlow,
  bindHost,
  type RecaptchaFactory,
} from "../src/features/auth/state/authBinding";
import { authService, AUTH_REQUEST_DEADLINE_MS } from "../src/features/auth/services/authService";
import { authCopy } from "../src/features/auth/utils/authErrors";

function serviceFactory(onCreate?: (parameters: Parameters<RecaptchaFactory>[2]) => void) {
  return (_auth: unknown, _element: HTMLElement, parameters: Parameters<RecaptchaFactory>[2]) => {
    onCreate?.(parameters);
    return {
      clear: vi.fn(),
      render: vi.fn(async () => 0),
      verify: vi.fn(async () => "verified-token"),
    } as unknown as RecaptchaVerifier;
  };
}

describe("invisible reCAPTCHA service recovery", () => {
  let element: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    sdk.parameters = undefined;
    __resetAuthBindingsForTests();
    element = document.createElement("div");
    element.id = "recaptcha-container";
    document.body.append(element);
  });

  afterEach(() => {
    authService.clearRecaptcha();
    __resetAuthBindingsForTests();
    __setRecaptchaFactoryForTests(null);
    element.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("constructs the legacy/resend verifier invisibly and runs verification", async () => {
    sdk.sendSms.mockImplementation(async (_auth, _phone, verifier: RecaptchaVerifier) => {
      await verifier.verify();
      return { confirm: vi.fn() };
    });

    const requested = await authService.requestOtp("9876543210");

    expect(requested.success).toBe(true);
    expect(sdk.construct).toHaveBeenCalledTimes(1);
    expect(sdk.parameters).toMatchObject({ size: "invisible" });
    expect(sdk.sendSms).toHaveBeenCalledTimes(1);
    const verifier = sdk.sendSms.mock.calls[0][2] as RecaptchaVerifier & {
      verify: ReturnType<typeof vi.fn>;
    };
    expect(verifier.verify).toHaveBeenCalledTimes(1);
  });

  it("rebuilds an invisible legacy verifier after a request error", async () => {
    sdk.sendSms.mockRejectedValueOnce(
      Object.assign(new Error("denied"), {
        code: "auth/captcha-check-failed",
      }),
    );
    sdk.sendSms.mockResolvedValueOnce({ confirm: vi.fn() });

    const failed = await authService.requestOtp("9876543210");
    expect(failed.success).toBe(false);
    expect(sdk.construct).toHaveBeenCalledTimes(2);

    const recovered = await authService.requestOtp("9123456789");
    expect(recovered.success).toBe(true);
    expect(sdk.sendSms).toHaveBeenCalledTimes(2);
    expect(sdk.sendSms.mock.calls.every((call) => call[2].parameters.size === "invisible")).toBe(
      true,
    );
  });

  it.each(["expiry", "error"] as const)("resets the legacy verifier after %s", async (reason) => {
    sdk.sendSms.mockImplementation(async (_auth, _phone, verifier: RecaptchaVerifier) => {
      await verifier.verify();
      return { confirm: vi.fn() };
    });
    expect((await authService.requestOtp("9876543210")).success).toBe(true);
    const first = sdk.sendSms.mock.calls[0][2] as RecaptchaVerifier & {
      clear: ReturnType<typeof vi.fn>;
    };
    const callback =
      reason === "expiry"
        ? sdk.parameters?.["expired-callback"]
        : sdk.parameters?.["error-callback"];
    expect(callback).toBeTypeOf("function");
    element.append(document.createElement("span"));
    (callback as () => void)();
    expect(first.clear).toHaveBeenCalledTimes(1);

    expect((await authService.requestOtp("9876543210")).success).toBe(true);
    expect(element.childElementCount).toBe(0);
    expect(sdk.construct).toHaveBeenCalledTimes(2);
    expect(sdk.sendSms).toHaveBeenCalledTimes(2);
  });

  it("resets after an invisible verification timeout and recovers on Continue", async () => {
    let parameters: Parameters<RecaptchaFactory>[2] | undefined;
    __setRecaptchaFactoryForTests(
      serviceFactory((params) => {
        parameters = params;
      }),
    );
    bindHost("login", "host-timeout", element);
    const firstVerifier = acquireForFlow("login");
    if (!firstVerifier.ok) throw new Error("test verifier not bound");
    vi.mocked(firstVerifier.verifier.verify).mockReturnValue(new Promise(() => {}));
    sdk.sendSms.mockImplementation(async (_auth, _phone, verifier: RecaptchaVerifier) => {
      await verifier.verify();
      return { confirm: vi.fn() };
    });

    const pending = authService.requestOtp("9876543210", "sms", undefined, "login");
    await vi.advanceTimersByTimeAsync(AUTH_REQUEST_DEADLINE_MS + 100);
    const timedOut = await pending;
    expect(sdk.sendSms).toHaveBeenCalledTimes(1);
    expect(timedOut.success).toBe(false);
    if (!timedOut.success) {
      expect(timedOut.error.code).toBe("AUTH_CAPTCHA_TIMEOUT");
      expect(timedOut.error.message).toBe(authCopy("AUTH_CAPTCHA_TIMEOUT"));
      expect(timedOut.error.message).not.toContain("tick the box");
    }

    parameters?.["expired-callback"]();
    const recovered = await authService.requestOtp("9876543210", "sms", undefined, "login");
    expect(recovered.success).toBe(true);
    expect(sdk.sendSms).toHaveBeenCalledTimes(2);
  });

  it("fails closed on render failure without sending SMS", async () => {
    __setRecaptchaFactoryForTests(
      () =>
        ({
          clear: vi.fn(),
          render: vi.fn().mockRejectedValue(new Error("script unavailable")),
          verify: vi.fn(async () => "verified-token"),
        }) as unknown as RecaptchaVerifier,
    );
    bindHost("login", "host-render-failed", element);
    sdk.sendSms.mockResolvedValue({ confirm: vi.fn() });

    const failed = await authService.requestOtp("9876543210", "sms", undefined, "login");
    expect(failed.success).toBe(false);
    expect(sdk.sendSms).not.toHaveBeenCalled();
  });

  it("rebuilds after a verification error and keeps the challenge unchanged on success", async () => {
    __setRecaptchaFactoryForTests(serviceFactory());
    bindHost("login", "host-verify-error", element);
    const first = acquireForFlow("login");
    if (!first.ok) throw new Error("test verifier not bound");
    vi.mocked(first.verifier.verify).mockRejectedValueOnce(
      Object.assign(new Error("challenge failed"), { code: "auth/captcha-check-failed" }),
    );
    const confirm = vi.fn();
    sdk.sendSms.mockImplementation(async (_auth, _phone, verifier: RecaptchaVerifier) => {
      await verifier.verify();
      return { confirm };
    });

    const failed = await authService.requestOtp("9876543210", "sms", undefined, "login");
    expect(failed.success).toBe(false);
    expect(sdk.sendSms).toHaveBeenCalledTimes(1);

    const recovered = await authService.requestOtp("9876543210", "sms", undefined, "login");
    expect(recovered.success).toBe(true);
    expect(sdk.sendSms).toHaveBeenCalledTimes(2);
    if (recovered.success) expect(recovered.data.otpToken).toBe("+919876543210");
  });

  it("retains the production test-number bypass guard", () => {
    const source = readFileSync(
      join(process.cwd(), "src/features/auth/services/authService.ts"),
      "utf8",
    );
    expect(source).not.toContain("appVerificationDisabledForTesting");
    expect(source).not.toContain("connectAuthEmulator");
  });
});
