/**
 * Customer login privacy-notice overlap regression (fix/login-privacy-c11).
 *
 * Evidence: screens/customer/360x740/18-signin.png shows the floating notice
 * covering the phone input; 390x844/18-signin.png shows it crowding Continue.
 * No SMS/OTP is exercised here — this pins the rendered login tree only.
 *
 * The layout owner (AppShell) is deliberately NOT mocked: the notice is mounted
 * by AppShell, so a stubbed AppShell would hide the very defect under test.
 * Only unrelated external seams (Firebase, router links, toaster, guest guard,
 * invisible reCAPTCHA factory) use the existing hermetic mock harness.
 *
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecaptchaVerifier } from "firebase/auth";

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
  useRouterState: () => ({ pathname: "/auth/login" }),
  Link: ({
    to,
    children,
    ...props
  }: React.PropsWithChildren<React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }>) => (
    <a href={String(to)} {...props}>
      {children}
    </a>
  ),
}));

// This suite lives in tests/ (outside tsconfig include), so the repo's
// alias resolver does not apply here: use the same relative paths as the
// neighbouring tests. The mocks still resolve to the exact modules that
// src/ imports through @/ aliases.
vi.mock("../src/shared/components/feedback/AppToaster", () => ({
  toast: { error: sdk.toastError, success: sdk.toastSuccess },
}));

vi.mock("../src/features/auth/hooks/useAuthGuard", () => ({ useGuestOnly: () => {} }));

import { Route } from "../src/routes/auth.login";
import { useAuthStore } from "../src/features/auth/state/authStore";
import {
  __resetAuthBindingsForTests,
  __setRecaptchaFactoryForTests,
} from "../src/features/auth/state/authBinding";

const LoginScreen = (Route as unknown as { options: { component: React.ComponentType } }).options
  .component;

/** The notice is rendered by the app shell, so the test renders the real one. */
describe("login privacy notice — in flow, no overlay, actions reachable", () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.clearAllMocks();
    __resetAuthBindingsForTests();
    __setRecaptchaFactoryForTests(
      () =>
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

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    queryClient = new QueryClient();
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <LoginScreen />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    queryClient.clear();
    __resetAuthBindingsForTests();
    __setRecaptchaFactoryForTests(null);
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("shows exactly one non-overlay notice alongside a reachable form and both legal/help actions", () => {
    // The page must contain a single notice anywhere in the document (no
    // duplicate mounted through a portal or a second copy in the route).
    const notices = Array.from(
      document.querySelectorAll<HTMLElement>('[aria-label="Privacy and Cookie Notice"]'),
    );
    expect(notices, "login must render exactly one privacy notice").toHaveLength(1);
    const notice = notices[0];

    // Real AppShell is present: notice, main and form share one scrollable
    // document flow. The old defect was `fixed bottom-36 z-[60]` on the aside.
    expect(container.querySelector(".app-shell")).not.toBeNull();
    expect(container.querySelector("main")).not.toBeNull();
    expect(notice.tagName).toBe("ASIDE");
    expect(notice.className).not.toMatch(/\b(?:fixed|absolute|sticky)\b/);
    expect(notice.style.position).not.toBe("fixed");
    expect(notice.style.position).not.toBe("absolute");
    expect(notice.getAttribute("aria-hidden")).toBeNull();
    expect(notice.closest("[inert]")).toBeNull();

    // Phone field and Continue keep their existing semantics (no submit here).
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Mobile number, 10 digits"]',
    );
    expect(input, "phone input must remain rendered").not.toBeNull();
    expect(input!.type).toBe("tel");
    const continueButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Continue",
    );
    expect(continueButton, "Continue must remain rendered").not.toBeNull();
    expect(continueButton!.getAttribute("type")).toBe("submit");
    expect(continueButton!.closest("form")).not.toBeNull();
    expect(continueButton!.closest("[inert]")).toBeNull();

    // Notice's legal links and explicit accept/dismiss controls stay present,
    // labelled and keyboard-reachable; the form's own legal links stay intact.
    expect(notice.textContent).toContain("Your Privacy Matters");
    expect(notice.textContent).toContain(
      "We use cookies and essential data to fulfill orders, ensure secure payments, and enhance " +
        "your dining experience in accordance with the India DPDP Act. Learn more in our",
    );
    const noticeLinks = Array.from(notice.querySelectorAll<HTMLAnchorElement>("a[href]")).map(
      (link) => [link.textContent?.trim(), link.getAttribute("href")],
    );
    expect(noticeLinks).toEqual([
      ["Privacy Policy", "/privacy"],
      ["Terms", "/terms"],
    ]);
    const noticeButtons = Array.from(notice.querySelectorAll("button"));
    expect(
      noticeButtons.map(
        (button) => button.getAttribute("aria-label") ?? button.textContent?.trim(),
      ),
    ).toEqual(["Dismiss privacy banner", "Accept & Continue"]);

    const formLinks = Array.from(container.querySelectorAll<HTMLAnchorElement>("a[href]"))
      .filter((link) => !notice.contains(link))
      .map((link) => [link.textContent?.trim(), link.getAttribute("href")]);
    expect(formLinks).toEqual([
      ["Terms of Service", "/terms"],
      ["Privacy Policy", "/privacy"],
    ]);

    for (const control of Array.from(notice.querySelectorAll<HTMLElement>("a[href], button"))) {
      expect(control.hasAttribute("disabled"), "notice controls must stay enabled").toBe(false);
      expect(control.tabIndex).toBeGreaterThanOrEqual(0);
    }
  });
});
