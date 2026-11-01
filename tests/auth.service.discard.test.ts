/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Real `authService` logic with ONLY the Firebase SDK boundary mocked.
 *
 * The store-level suites prove the store's contract against a fake service.
 * These prove the service's own guards: which session it is allowed to sign
 * out, and how the challenge generation treats a callback that resolves late.
 */

const sdk = vi.hoisted(() => ({
  auth: {
    currentUser: null as null | { uid: string; refreshToken: string },
    signOut: vi.fn(async () => undefined),
    authStateReady: vi.fn(async () => undefined),
  },
  signInWithPhoneNumber: vi.fn(),
}));

vi.mock("@/core/config/firebase", () => ({ auth: sdk.auth, db: {}, app: {} }));
vi.mock("firebase/auth", () => ({
  // The real config module may still run depending on importer resolution, so
  // the boundary mock answers getAuth with the same stub instance.
  getAuth: () => sdk.auth,
  onAuthStateChanged: () => () => undefined,
  signOut: sdk.auth.signOut,
  RecaptchaVerifier: class {
    render = async () => undefined;
    clear = () => undefined;
    constructor(_auth: unknown, _id: string, _opts: unknown) {}
  },
  signInWithPhoneNumber: sdk.signInWithPhoneNumber,
}));
vi.mock("@/core/logging/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { authService } from "../src/features/auth/services/authService";

const REF = { uid: "uid_synthetic_a", refreshToken: "refresh_a" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function sdkUser(refreshToken: string) {
  return {
    uid: REF.uid,
    refreshToken,
    phoneNumber: "+919825012345",
    getIdToken: async () => "access_synthetic",
  };
}

beforeEach(() => {
  sdk.auth.currentUser = null;
  sdk.auth.signOut.mockClear();
  sdk.signInWithPhoneNumber.mockReset();
  authService.cancelChallenge();
  authService.clearRecaptcha();
  document.body.innerHTML = '<div id="recaptcha-container"></div>';
});

describe("authService.discardConfirmedSession: exact-session only", () => {
  it("signs out when uid and refresh token both match the captured session", async () => {
    sdk.auth.currentUser = { uid: REF.uid, refreshToken: REF.refreshToken };
    await authService.discardConfirmedSession(REF);
    expect(sdk.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("refuses a different uid even with the same refresh token", async () => {
    sdk.auth.currentUser = { uid: "uid_synthetic_b", refreshToken: REF.refreshToken };
    await authService.discardConfirmedSession(REF);
    expect(sdk.auth.signOut).not.toHaveBeenCalled();
  });

  it("refuses a newer session for the same uid (refresh token differs)", async () => {
    sdk.auth.currentUser = { uid: REF.uid, refreshToken: "refresh_newer" };
    await authService.discardConfirmedSession(REF);
    expect(sdk.auth.signOut).not.toHaveBeenCalled();
  });

  it("refuses when the captured refresh token is missing, rather than matching uid only", async () => {
    sdk.auth.currentUser = { uid: REF.uid, refreshToken: "refresh_a" };
    await authService.discardConfirmedSession({ uid: REF.uid, refreshToken: "" });
    await authService.discardConfirmedSession({ uid: REF.uid, refreshToken: undefined as never });
    expect(sdk.auth.signOut).not.toHaveBeenCalled();
  });

  it("is a no-op when no Firebase session exists", async () => {
    sdk.auth.currentUser = null;
    await authService.discardConfirmedSession(REF);
    expect(sdk.auth.signOut).not.toHaveBeenCalled();
  });
});

describe("authService challenge generation", () => {
  it("rejects a request that was cancelled while the SMS was being dispatched", async () => {
    const pending = deferred<{ confirm: () => Promise<unknown> }>();
    sdk.signInWithPhoneNumber.mockReturnValueOnce(pending.promise);

    const request = authService.requestOtp("9825012345", "sms");
    await vi.waitFor(() => expect(sdk.signInWithPhoneNumber).toHaveBeenCalledTimes(1));

    authService.cancelChallenge();
    pending.resolve({ confirm: async () => ({ user: sdkUser("refresh_a") }) });

    const result = await request;
    expect(result.success).toBe(false);
    expect(!result.success && result.error.code).toBe("AUTH_OTP_SUPERSEDED");

    // Nothing confirmable was installed by the stale completion.
    const verify = await authService.verifyOtp("+919825012345", "123456");
    expect(verify.success).toBe(false);
    expect(!verify.success && verify.error.code).toBe("NO_CHALLENGE");
  });

  it("signs out exactly the session created by a confirm that was cancelled mid-flight", async () => {
    const confirmGate = deferred<{ user: ReturnType<typeof sdkUser> }>();
    sdk.signInWithPhoneNumber.mockResolvedValueOnce({
      confirm: () => confirmGate.promise,
    });

    await authService.requestOtp("9825012345", "sms");
    const verifying = authService.verifyOtp("+919825012345", "123456");
    await vi.waitFor(() => expect(sdk.signInWithPhoneNumber).toHaveBeenCalledTimes(1));

    // Cancelled after confirm() was invoked; the SDK then mints this session.
    authService.cancelChallenge();
    const user = sdkUser("refresh_a");
    sdk.auth.currentUser = user;
    confirmGate.resolve({ user });

    const result = await verifying;
    expect(result.success).toBe(false);
    expect(!result.success && result.error.code).toBe("AUTH_VERIFY_CANCELLED");
    expect(sdk.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("does not sign out when a different user owns the session at that moment", async () => {
    const confirmGate = deferred<{ user: ReturnType<typeof sdkUser> }>();
    sdk.signInWithPhoneNumber.mockResolvedValueOnce({ confirm: () => confirmGate.promise });

    await authService.requestOtp("9825012345", "sms");
    const verifying = authService.verifyOtp("+919825012345", "123456");

    authService.cancelChallenge();
    sdk.auth.currentUser = { uid: "uid_synthetic_b", refreshToken: "refresh_b" };
    confirmGate.resolve({ user: sdkUser("refresh_a") });

    const result = await verifying;
    expect(result.success).toBe(false);
    expect(sdk.auth.signOut).not.toHaveBeenCalled();
  });

  it("refuses a second confirm while one is in flight", async () => {
    const confirmGate = deferred<{ user: ReturnType<typeof sdkUser> }>();
    sdk.signInWithPhoneNumber.mockResolvedValueOnce({ confirm: () => confirmGate.promise });

    await authService.requestOtp("9825012345", "sms");
    const first = authService.verifyOtp("+919825012345", "123456");
    const second = await authService.verifyOtp("+919825012345", "123456");

    expect(second.success).toBe(false);
    expect(!second.success && second.error.code).toBe("VERIFY_IN_PROGRESS");

    confirmGate.resolve({ user: sdkUser("refresh_a") });
    await first;
  });
});
