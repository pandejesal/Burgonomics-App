/**
 * Launch-login regression for the owner's phone report. Mount the real login
 * screen/store/service, mock the verifier, and prove Continue triggers the
 * invisible verification path. Expiry and provider errors rebuild the verifier
 * without changing phone formatting, SMS dispatch, challenge or OTP confirmation.
 *
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfirmationResult, RecaptchaVerifier } from "firebase/auth";

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

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    doc: vi.fn((_db: unknown, _collection: string, id: string) => ({ id })),
    getDoc: vi.fn(async () => ({
      exists: () => true,
      data: () => ({ fullName: "Test Customer", email: null }),
    })),
    setDoc: vi.fn(async () => undefined),
  };
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

vi.mock("@/features/profile/repositories/ProfileRepository", () => ({
  profileRepository: {
    refresh: vi.fn(async () => ({ success: true, data: null })),
  },
}));

vi.mock("@/features/notifications/services/notificationsService", () => ({
  notificationsService: {
    linkUserToDeviceToken: vi.fn(async () => ({ success: true, data: null })),
    unlinkUserFromDeviceToken: vi.fn(async () => "ok"),
  },
}));

import { Route } from "@/routes/auth.login";
import { useAuthStore } from "@/features/auth/state/authStore";
import {
  __resetAuthBindingsForTests,
  __setRecaptchaFactoryForTests,
  type RecaptchaFactory,
} from "@/features/auth/state/authBinding";

const LoginScreen = (Route as unknown as { options: { component: React.ComponentType } }).options
  .component;

type RecaptchaParameters = Parameters<RecaptchaFactory>[2];
type MockVerifier = {
  element: HTMLElement;
  parameters: RecaptchaParameters;
  clear: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  verify: ReturnType<typeof vi.fn>;
};

let verifiers: MockVerifier[] = [];
let container: HTMLDivElement;
let root: Root;
let originalClientWidth: PropertyDescriptor | undefined;

function factory(): RecaptchaFactory {
  return (_auth, element, parameters) => {
    const record: MockVerifier = {
      element,
      parameters,
      clear: vi.fn(),
      render: vi.fn(async () => 0),
      verify: vi.fn(async () => "invisible-recaptcha-token"),
    };
    verifiers.push(record);
    return record as unknown as RecaptchaVerifier;
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

async function fillPhone(value = "9876543210") {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(phoneInput(), value);
    phoneInput().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function continueSignIn() {
  if (!phoneInput().value) await fillPhone();
  const form = container.querySelector("form");
  if (!form) throw new Error("login form missing");
  expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await act(async () => {});
}

function resetAuth() {
  useAuthStore.setState({
    status: "unauthenticated",
    user: null,
    accessToken: null,
    refreshToken: null,
    challenge: null,
    isBootstrapped: true,
    error: null,
  });
}

describe("login route — invisible reCAPTCHA", () => {
  beforeEach(() => {
    verifiers = [];
    vi.clearAllMocks();
    __resetAuthBindingsForTests();
    __setRecaptchaFactoryForTests(factory());
    resetAuth();
    sdk.sendSms.mockImplementation(async (_auth, _phone, verifier: RecaptchaVerifier) => {
      await verifier.verify();
      return { confirm: vi.fn() };
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

  it("creates an invisible verifier with no visible checkbox", async () => {
    await mount();
    const host = container.querySelector<HTMLElement>('[data-recaptcha-flow="login"]');
    expect(verifiers).toHaveLength(1);
    expect(verifiers[0].element).toBe(host);
    expect(verifiers[0].parameters.size).toBe("invisible");
    expect(verifiers[0].verify).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("I'm not a robot");
    expect(container.textContent).not.toContain("tick the box");
  });

  it("Continue verifies, sends one SMS and keeps the existing OTP challenge", async () => {
    await mount();
    expect(verifiers[0].verify).not.toHaveBeenCalled();
    expect(sdk.sendSms).not.toHaveBeenCalled();

    await continueSignIn();

    expect(verifiers).toHaveLength(1);
    expect(verifiers[0].verify).toHaveBeenCalledTimes(1);
    expect(sdk.sendSms).toHaveBeenCalledTimes(1);
    expect(sdk.sendSms.mock.calls[0][1]).toBe("+919876543210");
    expect(sdk.sendSms.mock.calls[0][2]).toBe(verifiers[0]);
    expect(useAuthStore.getState().status).toBe("otp_sent");
    expect(useAuthStore.getState().challenge?.otpToken).toBe("+919876543210");
    expect(sdk.navigate).toHaveBeenCalledWith({ to: "/auth/otp", search: { redirect: undefined } });
    expect(sdk.toastError).not.toHaveBeenCalled();
  });

  it.each(["expiry", "error"] as const)(
    "rebuilds after %s before Continue and succeeds without weakening verification",
    async (reason) => {
      await mount();
      const host = container.querySelector<HTMLElement>('[data-recaptcha-flow="login"]');
      if (reason === "expiry") verifiers[0].parameters["expired-callback"]();
      else verifiers[0].parameters["error-callback"]();
      expect(verifiers[0].clear).not.toHaveBeenCalled();

      await continueSignIn();

      expect(verifiers).toHaveLength(2);
      expect(verifiers[0].clear).toHaveBeenCalledTimes(1);
      expect(verifiers[1].element).toBe(host);
      expect(verifiers[1].parameters.size).toBe("invisible");
      expect(verifiers[1].verify).toHaveBeenCalledTimes(1);
      expect(sdk.sendSms).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().status).toBe("otp_sent");
    },
  );

  it("a failed verification rebuilds, then the next Continue succeeds", async () => {
    await mount();
    const first = verifiers[0];
    first.verify.mockRejectedValueOnce(
      Object.assign(new Error("challenge failed"), {
        code: "auth/captcha-check-failed",
      }),
    );

    await continueSignIn();
    expect(sdk.sendSms).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe("error");

    await continueSignIn();
    expect(verifiers).toHaveLength(2);
    expect(first.clear).toHaveBeenCalledTimes(1);
    expect(verifiers[1].verify).toHaveBeenCalledTimes(1);
    expect(sdk.sendSms).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState().status).toBe("otp_sent");
  });

  it("confirms the same issued challenge with the unchanged six-digit OTP", async () => {
    const confirm = vi.fn(async () => ({
      user: {
        uid: "uid-invisible-recaptcha",
        phoneNumber: "+919876543210",
        refreshToken: "refresh-test",
        getIdToken: vi.fn(async () => "id-token-test"),
      },
    }));
    sdk.sendSms.mockImplementation(async (_auth, _phone, verifier: RecaptchaVerifier) => {
      await verifier.verify();
      return { confirm } as unknown as ConfirmationResult;
    });

    await mount();
    await continueSignIn();
    expect(useAuthStore.getState().status).toBe("otp_sent");
    let verified: { ok: boolean; error?: string } | undefined;
    await act(async () => {
      verified = await useAuthStore.getState().verifyOtp("123456");
    });

    expect(verified?.ok).toBe(true);
    expect(confirm).toHaveBeenCalledWith("123456");
    expect(useAuthStore.getState().status).toBe("authenticated");
  });
});
