/**
 * Tests that the login route renders its connected invisible reCAPTCHA host
 * before Continue without reserving visible-widget space.
 *
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecaptchaVerifier } from "firebase/auth";
import { readFileSync } from "node:fs";
import { join } from "node:path";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const sdk = vi.hoisted(() => ({
  sendSms: vi.fn(),
  navigate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("firebase/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/auth")>();
  return { ...actual, signInWithPhoneNumber: sdk.sendSms };
});

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: React.ComponentType }) => ({
    options,
    useSearch: () => ({}),
  }),
  useNavigate: () => sdk.navigate,
  Link: ({
    to,
    children,
    ...props
  }: React.PropsWithChildren<{ to: string; className?: string }>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock("@/shared/components/feedback/AppToaster", () => ({
  toast: { error: sdk.toastError, success: sdk.toastSuccess },
}));

vi.mock("@/features/auth/hooks/useAuthGuard", () => ({ useGuestOnly: () => {} }));

import { Route } from "@/routes/auth.login";
import { useAuthStore } from "@/features/auth/state/authStore";
import {
  __resetAuthBindingsForTests,
  __setRecaptchaFactoryForTests,
  type RecaptchaFactory,
} from "@/features/auth/state/authBinding";

const LoginScreen = (Route as unknown as { options: { component: React.ComponentType } }).options
  .component;

let container: HTMLDivElement;
let root: Root;
let originalClientWidth: PropertyDescriptor | undefined;

describe("login route — connected invisible reCAPTCHA host", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetAuthBindingsForTests();
    __setRecaptchaFactoryForTests(
      (_auth, _element, _params) =>
        ({
          clear: vi.fn(),
          render: vi.fn().mockResolvedValue(0),
          verify: vi.fn(async () => "verified-token"),
        }) as unknown as RecaptchaVerifier,
    );
    useAuthStore.setState({
      status: "unauthenticated",
      user: null,
      accessToken: null,
      refreshToken: null,
      challenge: null,
      isBootstrapped: true,
      error: null,
    });
    originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 320,
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    useAuthStore.getState().changePhone();
    __resetAuthBindingsForTests();
    __setRecaptchaFactoryForTests(null);
    if (originalClientWidth) {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
    }
  });

  it("renders an invisible host ABOVE Continue without visible-widget copy", async () => {
    await act(async () => root.render(<LoginScreen />));
    await act(async () => {});

    const host = container.querySelector<HTMLElement>('[data-recaptcha-flow="login"]');
    const submitBtn = container.querySelector<HTMLButtonElement>('button[type="submit"]');

    expect(host, "reCAPTCHA host must exist").not.toBeNull();
    expect(submitBtn, "Continue button must exist").not.toBeNull();
    expect(host!.dataset.recaptchaSize).toBe("invisible");
    expect(container.textContent).not.toContain("I'm not a robot");

    const position = host!.compareDocumentPosition(submitBtn!);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("does not reserve normal or compact widget height", () => {
    const source = readFileSync(join(__dirname, "components", "PhoneLoginForm.tsx"), "utf8");
    expect(source).not.toContain("min-h-[78px]");
  });
});
