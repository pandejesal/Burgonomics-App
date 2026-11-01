/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression: the OTP grid emits a positional value with a space placeholder
 * for an empty slot ("12 456"). Six characters is not six digits, so Verify
 * must stay disabled — the old `code.length === OTP_LENGTH` gate enabled it.
 */

const boundary = vi.hoisted(() => ({
  state: null as null | Record<string, unknown>,
  navigate: vi.fn(),
  verifyOtp: vi.fn(async () => ({ ok: true })),
  resendOtp: vi.fn(async () => ({ ok: false })),
  changePhone: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: React.ComponentType }) => ({
    options,
    useSearch: () => ({}),
  }),
  useNavigate: () => boundary.navigate,
  useRouterState: () => ({ location: { pathname: "/auth/otp", search: {} } }),
  useRouter: () => ({ navigate: boundary.navigate }),
  Link: ({ to, children }: React.PropsWithChildren<{ to: string }>) => <a href={to}>{children}</a>,
}));
vi.mock("../src/features/auth/state/authStore", () => ({
  useAuthStore: <Value,>(selector: (state: Record<string, unknown>) => Value) => {
    if (!boundary.state) throw new Error("state not initialized");
    return selector(boundary.state);
  },
}));
vi.mock("../src/features/auth/hooks/useAuthGuard", () => ({ useGuestOnly: () => undefined }));
vi.mock("../src/shared/components/feedback/AppToaster", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("../src/shared/layouts/AppShell", () => ({
  AppShell: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
vi.mock("../src/features/auth/services/authService", () => ({
  authService: { initRecaptcha: vi.fn(), clearRecaptcha: vi.fn() },
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

import { Route } from "../src/routes/auth.otp";

const OtpScreen = Route.options.component as React.ComponentType;

let root: Root | null = null;
let host: HTMLDivElement;

function verifyButton(): HTMLButtonElement {
  return host.querySelector<HTMLButtonElement>("button.w-full")!;
}

async function type(index: number, digit: string) {
  const input = host.querySelectorAll<HTMLInputElement>("input")[index];
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(input, digit);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(async () => {
  boundary.state = {
    status: "otp_sent",
    error: null,
    challenge: {
      otpToken: "+919825012345",
      phone: "9825012345",
      requestedAt: Date.now(),
      resendAfterSec: 60,
    },
    verifyOtp: boundary.verifyOtp,
    resendOtp: boundary.resendOtp,
    changePhone: boundary.changePhone,
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<OtpScreen />));
});

afterEach(async () => {
  const mounted = root;
  if (mounted) await act(async () => mounted.unmount());
  root = null;
  host?.remove();
  vi.clearAllMocks();
});

describe("OTP screen submit gate", () => {
  it("keeps Verify disabled when six characters contain a hole", async () => {
    expect(host.querySelectorAll("input").length).toBe(6);
    // 1 2 _ 4 5 6 -> the positional value is "12 456": six characters, five digits.
    await type(0, "1");
    await type(1, "2");
    await type(3, "4");
    await type(4, "5");
    await type(5, "6");

    expect(verifyButton().disabled).toBe(true);
  });

  it("enables Verify only for six actual digits", async () => {
    await type(0, "1");
    await type(1, "2");
    await type(2, "3");
    await type(3, "4");
    await type(4, "5");
    await type(5, "6");

    expect(verifyButton().disabled).toBe(false);
  });
});
