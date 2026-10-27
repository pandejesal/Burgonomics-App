/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * F12 (P3) — verifyOtp must be single-flight.
 *
 * WebOTP autofill, a clipboard paste and a button tap can each fire a confirm
 * in the same tick; pre-fix every one called authRepository.verifyOtp (double
 * confirm attempts, duplicate 429s). The guard must also RESET after a failure
 * so the customer can retry.
 *
 * F11 (P3) — a successful verification refreshes the loyalty balance from the
 * server right beside token linking, so the wallet never shows a stale/zero
 * balance for the rest of the session.
 */
const { mockGetDoc } = vi.hoisted(() => ({ mockGetDoc: vi.fn() }));

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    doc: vi.fn((...args: unknown[]) => args),
    getDoc: mockGetDoc,
  };
});

import { useAuthStore } from "../src/features/auth/state/authStore";
import { authRepository } from "../src/features/auth/repositories/AuthRepository";
import { profileRepository } from "../src/features/profile/repositories/ProfileRepository";
import { useProfileStore } from "../src/features/profile/state/profileStore";
import { useLoyaltyStore } from "../src/features/loyalty/state/loyaltyStore";

const USER = { id: "uid_verify", phone: "+919825012345", name: "Verifier" };

const seedChallenge = () =>
  useAuthStore.setState({
    status: "otp_sent",
    user: null,
    accessToken: null,
    refreshToken: null,
    challenge: {
      handle: "handle_verify_1",
      phone: USER.phone,
      maskedPhone: "******2345",
      requestedAt: Date.now(),
      issuedAt: Date.now(),
      resendAfterSec: 30,
      displayExpiresAt: Date.now() + 300_000,
      deliveryMethod: "sms",
    },
    isBootstrapped: true,
    error: null,
  });

describe("authStore.verifyOtp single-flight + loyalty refresh (F12/F11)", () => {
  beforeEach(() => {
    mockGetDoc.mockReset();
    seedChallenge();
    useProfileStore.setState({ profile: null });
    useLoyaltyStore.setState({ balance: 0, lastSyncedAt: null });
    vi.spyOn(profileRepository, "refresh").mockResolvedValue({ success: true, data: null } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("collapses concurrent confirmations into ONE verify call", async () => {
    let release!: (value: any) => void;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const verify = vi.spyOn(authRepository, "verifyOtp").mockImplementation(
      async () => {
        await gate;
        return {
          success: true as const,
          data: { user: USER, accessToken: "a", refreshToken: "r" },
        } as any;
      },
    );

    const first = useAuthStore.getState().verifyOtp("login", "handle_verify_1", "123456");
    const second = useAuthStore.getState().verifyOtp("login", "handle_verify_1", "123456");

    // Flush microtasks to let the first call enter the repository.
    await Promise.resolve();
    expect(verify).toHaveBeenCalledTimes(1);

    release(undefined);
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe("authenticated");
  });

  it("resets the guard after a failure so a retry is allowed", async () => {
    const verify = vi
      .spyOn(authRepository, "verifyOtp")
      .mockResolvedValue({ success: false, error: { code: "INVALID", message: "bad code" } } as any);

    const first = await useAuthStore.getState().verifyOtp("login", "handle_verify_1", "000000");
    expect(first.ok).toBe(false);
    expect(useAuthStore.getState().status).toBe("otp_sent");

    const second = await useAuthStore.getState().verifyOtp("login", "handle_verify_1", "123456");
    expect(second.ok).toBe(false);
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it("refreshes the loyalty balance from the server after success (F11)", async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ loyaltyPoints: 275 }),
    });
    vi.spyOn(authRepository, "verifyOtp").mockResolvedValue({
      success: true,
      data: { user: USER, accessToken: "a", refreshToken: "r" },
    } as any);

    const res = await useAuthStore.getState().verifyOtp("login", "handle_verify_1", "123456");
    expect(res.ok).toBe(true);

    await vi.waitFor(() => {
      expect(useLoyaltyStore.getState().balance).toBe(275);
    });
    const customerReads = mockGetDoc.mock.calls.filter(
      (call) => call[0]?.[1] === "customers" && call[0]?.[2] === USER.id,
    );
    expect(customerReads.length).toBeGreaterThan(0);
  });
});
