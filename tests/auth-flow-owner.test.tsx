// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { RecaptchaVerifier } from "firebase/auth";
import { RecaptchaHost } from "../src/features/auth/components/RecaptchaHost";
import {
  __resetAuthBindingsForTests,
  __setRecaptchaFactoryForTests,
} from "../src/features/auth/state/authBinding";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

describe("auth flow ownership at the UI seams", () => {
  const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

  beforeEach(() => {
    __resetAuthBindingsForTests();
    __setRecaptchaFactoryForTests(
      () => ({ clear: vi.fn(), render: vi.fn() }) as unknown as RecaptchaVerifier,
    );
  });

  afterEach(async () => {
    for (const { root, container } of roots.splice(0)) {
      await act(async () => root.unmount());
      container.remove();
    }
    __resetAuthBindingsForTests();
    __setRecaptchaFactoryForTests(null);
    vi.restoreAllMocks();
  });

  async function renderHost(width: number, flow: "login" | "checkout" = "login") {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    const measure = () => width;
    await act(async () => {
      root.render(<RecaptchaHost flow={flow} measure={measure} />);
      await Promise.resolve();
    });
    return container;
  }

  it.each([
    [277, "compact"],
    [304, "normal"],
    [348, "normal"],
  ] as const)("maps host width %s to %s", async (width, size) => {
    const container = await renderHost(width);
    const host = container.querySelector<HTMLElement>('[data-recaptcha-flow="login"]');
    expect(host).not.toBeNull();
    expect(host!.dataset.recaptchaSize).toBe(size);
    expect(host!.id.startsWith("recaptcha-host_")).toBe(true);
  });

  it("renders a unique host per mounted flow and never a global id", async () => {
    const login = await renderHost(320, "login");
    const checkout = await renderHost(320, "checkout");
    const ids = [
      ...login.querySelectorAll<HTMLElement>("[data-recaptcha-flow]"),
      ...checkout.querySelectorAll<HTMLElement>("[data-recaptcha-flow]"),
    ].map((node) => node.id);
    expect(new Set(ids).size).toBe(2);
    expect(document.getElementById("recaptcha-container")).toBeNull();
  });

  it("uses explicit per-flow APIs at every caller", () => {
    const login = source("../src/routes/auth.login.tsx");
    expect(login).toContain('requestOtp("login", sanitized, "sms")');

    const otp = source("../src/routes/auth.otp.tsx");
    expect(otp).toContain('<RecaptchaHost flow="otp" />');
    expect(otp).toContain('authService.adoptChallenge("otp", challenge.handle)');
    expect(otp).toContain('verifyOtp("otp", challenge.handle, value)');
    expect(otp).toContain('resendOtp("otp")');

    const quick = source("../src/features/checkout/components/QuickAuthSheet.tsx");
    expect(quick).toContain('authService.resumeChallenge("checkout")');
    expect(quick).toContain('requestOtp("checkout", `+91${sanitizePhone(phone)}`, "sms")');
    expect(quick).toContain('verifyOtp("checkout", active.handle, otp)');
    expect(quick).toContain('<RecaptchaHost flow="checkout" />');

    const form = source("../src/features/auth/components/PhoneLoginForm.tsx");
    expect(form).toContain('<RecaptchaHost flow="login" />');
    expect(form).not.toContain('id="recaptcha-container"');
  });
});
