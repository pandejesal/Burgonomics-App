/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * F11 (P3) — RETIRED with loyalty (owner decision 2026-11-20: "Loyalty no:
 * hide coins, tiers and points everywhere").
 *
 * This suite used to pin the opposite behaviour: after a cold boot or a silent
 * token refresh the auth store refreshed the coin balance from the server, so
 * the wallet/profile tier did not render a stale number. The wallet, the tier
 * and the order-confirmation credit are all gone, so that read has no consumer.
 *
 * The assertions are inverted rather than deleted: the device-token link must
 * still fire on both restore paths (that seam is NOT part of the retirement),
 * and the coin balance must stay untouched with NO `customers/{uid}` read. The
 * store and the getDoc spy stay installed so a re-introduced refresh fails
 * here instead of silently passing.
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
import { notificationsService } from "../src/features/notifications/services/notificationsService";
import { profileRepository } from "../src/features/profile/repositories/ProfileRepository";
import { useProfileStore } from "../src/features/profile/state/profileStore";
import { useLoyaltyStore } from "../src/features/loyalty/state/loyaltyStore";
import { secureStorage, SECURE_KEYS } from "../src/core/storage/secureStorage";

const USER = { id: "uid_boot", phone: "+919825012345", name: "Boot" };

function jwt(expSecondsFromNow: number): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      sub: USER.id,
      exp: Math.floor(Date.now() / 1000) + expSecondsFromNow,
    }),
  );
  return `${header}.${payload}.${btoa("sig")}`;
}

async function seedSession(accessToken: string) {
  await secureStorage.set(SECURE_KEYS.ACCESS_TOKEN, accessToken);
  await secureStorage.set(SECURE_KEYS.REFRESH_TOKEN, "refresh_boot");
  await secureStorage.set(SECURE_KEYS.USER, JSON.stringify(USER));
}

const customerReads = () =>
  mockGetDoc.mock.calls.filter((call) => call[0]?.[1] === "customers" && call[0]?.[2] === USER.id);

describe("authStore.bootstrap after the loyalty retirement (F11 retired)", () => {
  beforeEach(async () => {
    useAuthStore.setState({
      status: "idle",
      user: null,
      accessToken: null,
      refreshToken: null,
      challenge: null,
      isBootstrapped: false,
      error: null,
    });
    useProfileStore.setState({ profile: null });
    useLoyaltyStore.setState({ balance: 0, lastSyncedAt: null });
    mockGetDoc.mockReset();
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ loyaltyPoints: 88 }) });
    vi.spyOn(profileRepository, "refresh").mockResolvedValue({ success: true, data: null } as any);
    vi.spyOn(notificationsService, "linkUserToDeviceToken").mockResolvedValue({
      success: true,
      data: null,
    } as any);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await secureStorage.remove(SECURE_KEYS.ACCESS_TOKEN);
    await secureStorage.remove(SECURE_KEYS.REFRESH_TOKEN);
    await secureStorage.remove(SECURE_KEYS.USER);
  });

  it("does NOT refresh a coin balance on the unexpired-token restore path", async () => {
    await seedSession(jwt(3600));
    const link = vi.mocked(notificationsService.linkUserToDeviceToken);

    await useAuthStore.getState().bootstrap(async () => USER.id);
    expect(useAuthStore.getState().status).toBe("authenticated");

    // The session is adopted and the device token is still linked — that seam
    // is untouched by the retirement — but no balance is fetched.
    await vi.waitFor(() => expect(link).toHaveBeenCalledWith(USER.id));
    expect(customerReads()).toHaveLength(0);
    expect(useLoyaltyStore.getState().balance).toBe(0);
  });

  it("does NOT refresh a coin balance on the silent-token-refresh restore path", async () => {
    await seedSession(jwt(-60));
    vi.spyOn(authRepository, "refresh").mockResolvedValue({
      success: true,
      data: { accessToken: jwt(3600), refreshToken: "refresh_new" },
    } as any);
    const link = vi.mocked(notificationsService.linkUserToDeviceToken);

    await useAuthStore.getState().bootstrap(async () => USER.id);
    expect(useAuthStore.getState().status).toBe("authenticated");

    await vi.waitFor(() => expect(link).toHaveBeenCalledWith(USER.id));
    expect(customerReads()).toHaveLength(0);
    expect(useLoyaltyStore.getState().balance).toBe(0);
  });

  it("does not query loyalty for a rejected (stolen) session", async () => {
    await seedSession(jwt(3600));

    await useAuthStore.getState().bootstrap(async () => "uid_intruder");

    expect(useAuthStore.getState().status).toBe("guest");
    expect(customerReads()).toHaveLength(0);
  });
});
