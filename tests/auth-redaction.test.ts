// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConfirmationResult, RecaptchaVerifier } from "firebase/auth";
import { logger, type LogSink } from "../src/core/logging/logger";
import {
  __resetAuthBindingsForTests,
  __setRecaptchaFactoryForTests,
  bindHost,
} from "../src/features/auth/state/authBinding";
import { createAuthAttemptController } from "../src/features/auth/state/authAttempts";
import { authCopy, firebaseAuthCode } from "../src/features/auth/utils/authErrors";

const SENTINEL = "+919999900000";

function confirmation(): ConfirmationResult {
  return { confirm: vi.fn() } as unknown as ConfirmationResult;
}

describe("auth redaction: provider detail never reaches a sink or caller", () => {
  const events: unknown[] = [];
  const sink: LogSink = {
    name: "auth-redaction-test",
    write(event) {
      events.push(event);
    },
  };
  let consoleError: ReturnType<typeof vi.spyOn>;
  let consoleWarn: ReturnType<typeof vi.spyOn>;
  let element: HTMLDivElement;

  beforeEach(() => {
    __resetAuthBindingsForTests();
    __setRecaptchaFactoryForTests(
      () => ({ clear: vi.fn(), render: vi.fn() }) as unknown as RecaptchaVerifier,
    );
    element = document.createElement("div");
    document.body.append(element);
    bindHost("login", "host_redaction", element, () => 320);
    events.length = 0;
    logger.addSink(sink);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logger.removeSink("auth-redaction-test");
    __resetAuthBindingsForTests();
    __setRecaptchaFactoryForTests(null);
    element.remove();
    vi.restoreAllMocks();
  });

  it("returns authored copy and logs/logs nothing containing the sentinel", async () => {
    const controller = createAuthAttemptController({
      sendSms: vi.fn(async () => {
        throw Object.assign(new Error(`Firebase: phone ${SENTINEL} blocked`), {
          code: "auth/too-many-requests",
          customData: { phone: SENTINEL },
        });
      }),
      now: () => 1_000,
    });

    const result = await controller.requestOtp("login", "9999900000");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("AUTH_TOO_MANY_REQUESTS");
      expect(result.error.message).not.toContain(SENTINEL);
      expect(result.error.message).not.toMatch(/\d{10}/);
    }
    expect(JSON.stringify(result)).not.toContain(SENTINEL);
    expect(JSON.stringify(events)).not.toContain(SENTINEL);
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("extracts only the SDK code, never the raw message", () => {
    const error = Object.assign(new Error(`bad ${SENTINEL}`), {
      code: "auth/invalid-verification-code",
      message: `bad ${SENTINEL}`,
    });
    expect(firebaseAuthCode(error)).toBe("auth/invalid-verification-code");
    const copy = authCopy("AUTH_INVALID_CODE");
    expect(copy).not.toContain(SENTINEL);
    expect(copy).not.toMatch(/\d{10}/);
  });

  it("keeps production callers on code-only diagnostics and a real checkout host", () => {
    const quick = readFileSync(
      join(process.cwd(), "src/features/checkout/components/QuickAuthSheet.tsx"),
      "utf8",
    );
    expect(quick).toContain('<RecaptchaHost flow="checkout" />');
    expect(quick).not.toContain('"whatsapp"');
    expect(quick).not.toMatch(/console\.error\([^)]*res\.error/);

    const login = readFileSync(
      join(process.cwd(), "src/routes/auth.login.tsx"),
      "utf8",
    );
    expect(login).toContain("res.code");
    expect(login).not.toMatch(/console\.error\([^)]*res\.error/);

    const otp = readFileSync(
      join(process.cwd(), "src/routes/auth.otp.tsx"),
      "utf8",
    );
    expect(otp).toContain("res.code");
    expect(otp).not.toMatch(/console\.error\([^)]*res\.error/);

    const root = readFileSync(
      join(process.cwd(), "src/routes/__root.tsx"),
      "utf8",
    );
    expect(root).not.toContain('id="recaptcha-container"');
  });

  it("does not contain an emulator/testing bypass in auth source", () => {
    const files = [
      "src/features/auth/services/authService.ts",
      "src/features/auth/state/authAttempts.ts",
      "src/features/auth/state/authBinding.ts",
      "src/features/auth/components/RecaptchaHost.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).not.toContain("connectAuthEmulator");
      expect(source).not.toContain("appVerificationDisabledForTesting");
    }
  });
});
