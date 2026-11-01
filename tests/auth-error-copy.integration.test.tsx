/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { useAuthStore } from "../src/features/auth/state/authStore";
import { GENERIC_ERROR_MESSAGE } from "../src/core/errors/userMessages";
import { Route } from "../src/routes/auth.login";

type LoginState = Pick<
  ReturnType<typeof useAuthStore.getState>,
  "status" | "error" | "requestOtp" | "clearError"
>;

const boundary = vi.hoisted(() => ({
  state: null as LoginState | null,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: React.ComponentType }) => ({
    options,
    useSearch: () => ({}),
  }),
  useNavigate: () => boundary.navigate,
  Link: ({
    to,
    children,
    ...props
  }: React.PropsWithChildren<{
    to: string;
    className?: string;
  }>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("../src/features/auth/state/authStore", () => ({
  useAuthStore: <Value,>(selector: (state: LoginState) => Value) => {
    if (!boundary.state) throw new Error("Login test state was not initialized");
    return selector(boundary.state);
  },
}));
vi.mock("../src/features/auth/hooks/useAuthGuard", () => ({ useGuestOnly: () => {} }));
vi.mock("../src/shared/components/feedback/AppToaster", () => ({
  toast: { error: boundary.toastError, success: boundary.toastSuccess },
}));
vi.mock("../src/shared/layouts/AppShell", () => ({
  AppShell: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

const LoginScreen = Route.options.component as React.ComponentType;
const rawError = "recaptcha is not defined";

describe("login error copy at the rendered screen boundary", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    boundary.state = {
      status: "unauthenticated",
      error: null,
      requestOtp: vi.fn().mockResolvedValue({ ok: false, error: rawError }),
      clearError: vi.fn(),
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("maps a raw store error before rendering the inline banner", async () => {
    boundary.state = { ...boundary.state!, status: "error", error: rawError };
    await act(async () => root.render(<LoginScreen />));

    const banner = container.querySelector('[role="alert"]');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain(GENERIC_ERROR_MESSAGE);
    expect(banner!.textContent).not.toContain(rawError);
  });

  it("maps a failed phone submission before sending the error toast", async () => {
    // The screen deliberately logs the raw diagnostic; only customer copy is mapped.
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => root.render(<LoginScreen />));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    const input = container.querySelector<HTMLInputElement>('input[type="tel"]');
    expect(input).not.toBeNull();
    // Use the native setter so React observes a real input change, not its value tracker.
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setValue.call(input, "9876543210");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(submit).not.toBeNull();
    expect(submit!.disabled).toBe(false);
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    await act(async () => {
      form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(boundary.state!.requestOtp).toHaveBeenCalledWith("9876543210", "sms");
    expect(boundary.toastError).toHaveBeenCalledExactlyOnceWith(GENERIC_ERROR_MESSAGE);
    expect(boundary.toastError).not.toHaveBeenCalledWith(rawError);
    expect(diagnostic).toHaveBeenCalledWith("[auth] OTP request failed:", rawError);
  });
});
