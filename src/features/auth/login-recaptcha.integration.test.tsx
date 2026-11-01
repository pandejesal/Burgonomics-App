/**
 * Live-login regression: the launch login screen renders its own reCAPTCHA
 * host, while the auth service used to look up the pre-launch
 * `#recaptcha-container`. On staging every web sign-in therefore failed with
 * "Verification check failed to load" although the widget host was on screen.
 *
 * This test mounts the REAL login route with the REAL auth store, repository
 * and service. Only the Firebase SMS send is stubbed; the verifier factory seam
 * records which DOM element the service actually binds, so the assertion is
 * that the element is connected to the document at construction time.
 *
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

type BoundVerifier = {
  element: HTMLElement;
  connectedAtConstruction: boolean;
  render: ReturnType<typeof vi.fn>;
};

let bound: BoundVerifier[] = [];
let container: HTMLDivElement;
let root: Root;
let originalClientWidth: PropertyDescriptor | undefined;

function factory(): RecaptchaFactory {
  return (_auth, element, parameters) => {
    const record: BoundVerifier = {
      element,
      connectedAtConstruction: element.isConnected,
      render: vi.fn(async () => 0),
    };
    bound.push(record);
    // The binding layer expects a RecaptchaVerifier-shaped object.
    return {
      render: record.render,
      clear: () => parameters.callback(),
    } as unknown as ReturnType<RecaptchaFactory>;
  };
}

async function mount() {
  await act(async () => root.render(<LoginScreen />));
  await act(async () => {});
}

function phoneInput() {
  const input = container.querySelector<HTMLInputElement>('input[type="tel"]');
  if (!input) throw new Error("login phone input missing");
  return input;
}

async function submitPhone(value = "9876543210") {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(phoneInput(), value);
    phoneInput().dispatchEvent(new Event("input", { bubbles: true }));
  });
  const form = container.querySelector("form");
  if (!form) throw new Error("login form missing");
  expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await act(async () => {});
}

describe("login route — reCAPTCHA host is the element the service binds", () => {
  beforeEach(() => {
    bound = [];
    vi.clearAllMocks();
    __resetAuthBindingsForTests();
    __setRecaptchaFactoryForTests(factory());
    useAuthStore.setState({
      status: "unauthenticated",
      user: null,
      accessToken: null,
      refreshToken: null,
      challenge: null,
      isBootstrapped: true,
      error: null,
    });
    sdk.sendSms.mockResolvedValue({ confirm: vi.fn() });
    // jsdom has no layout: give the host a measurable width so RecaptchaHost
    // can bind on its first frame, exactly as a real browser does.
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

  it("binds the on-screen host, not a missing #recaptcha-container", async () => {
    await mount();

    const host = container.querySelector<HTMLElement>('[data-recaptcha-flow="login"]');
    expect(host, "launch login must render its reCAPTCHA host").not.toBeNull();
    expect(host!.isConnected).toBe(true);
    // The legacy id is gone from the launch markup; the service must not need it.
    expect(document.getElementById("recaptcha-container")).toBeNull();

    await submitPhone();

    expect(bound).toHaveLength(1);
    expect(bound[0].connectedAtConstruction).toBe(true);
    expect(bound[0].element).toBe(host);
    expect(bound[0].render).toHaveBeenCalled();
    expect(sdk.sendSms).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe("otp_sent");
    expect(useAuthStore.getState().challenge?.otpToken).toBe("+919876543210");
    expect(sdk.toastError).not.toHaveBeenCalled();
  });

  it("re-arms the same host after a failed attempt, then succeeds", async () => {
    await mount();
    const host = container.querySelector<HTMLElement>('[data-recaptcha-flow="login"]');
    sdk.sendSms.mockRejectedValueOnce(new Error("auth/too-many-requests"));

    await submitPhone();
    expect(useAuthStore.getState().status).toBe("error");
    expect(bound[0].element).toBe(host);

    await submitPhone();
    expect(bound.length).toBeGreaterThanOrEqual(2);
    expect(bound.every((item) => item.element === host && item.connectedAtConstruction)).toBe(
      true,
    );
    expect(useAuthStore.getState().status).toBe("otp_sent");
  });

  it("binds a fresh host after the screen is re-mounted", async () => {
    await mount();
    const firstHost = container.querySelector<HTMLElement>('[data-recaptcha-flow="login"]');
    await submitPhone();
    expect(bound[0].element).toBe(firstHost);

    await act(async () => root.unmount());
    root = createRoot(container);
    await mount();

    const secondHost = container.querySelector<HTMLElement>('[data-recaptcha-flow="login"]');
    expect(secondHost).not.toBeNull();
    expect(document.body.contains(secondHost)).toBe(true);
    await submitPhone("9123456789");
    expect(bound.at(-1)!.element).toBe(secondHost);
    expect(bound.at(-1)!.connectedAtConstruction).toBe(true);
  });
});
