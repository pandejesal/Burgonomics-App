// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useAuthStore } from "../src/features/auth/state/authStore";
import { authService } from "../src/features/auth/services/authService";
import { authRepository } from "../src/features/auth/repositories/AuthRepository";
import { notificationsService } from "../src/features/notifications/services/notificationsService";
import { profileRepository } from "../src/features/profile/repositories/ProfileRepository";
import { secureStorage, SECURE_KEYS } from "../src/core/storage/secureStorage";

const USER = { id: "uid_epoch", phone: "+919825012345", name: "Epoch User" };

function seedChallenge() {
  useAuthStore.setState({
    status: "otp_sent",
    user: null,
    accessToken: null,
    refreshToken: null,
    challenge: {
      handle: "handle_epoch",
      phone: USER.phone,
      maskedPhone: "******2345",
      requestedAt: Date.now(),
      issuedAt: Date.now(),
      resendAfterSec: 60,
      displayExpiresAt: Date.now() + 300_000,
      deliveryMethod: "sms",
    },
    isBootstrapped: true,
    error: null,
    quarantinedUid: null,
  });
}

describe("authStore epoch gate and logout ordering", () => {
  beforeEach(() => {
    authService.__resetForTests();
    seedChallenge();
    vi.spyOn(profileRepository, "refresh").mockResolvedValue({ success: true, data: null } as any);
    vi.spyOn(profileRepository, "clearCache").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    authService.__resetForTests();
  });

  it("re-checks the epoch after persistSession and never hydrates profile on a stale commit", async () => {
    const sdkUser = { uid: USER.id };
    vi.spyOn(authRepository, "verifyOtp").mockResolvedValue({
      success: true,
      data: {
        user: USER,
        accessToken: "access",
        refreshToken: "refresh",
        sdkUser,
        attemptEpoch: authService.getIntentEpoch(),
      },
    } as any);
    const cleanup = vi.spyOn(authService, "cleanupStaleUser").mockResolvedValue(undefined);
    const link = vi.spyOn(notificationsService, "linkUserToDeviceToken").mockResolvedValue({
      success: true,
      data: null,
    } as any);

    const originalSet = secureStorage.set.bind(secureStorage);
    vi.spyOn(secureStorage, "set").mockImplementation(async (key, value) => {
      if (key === SECURE_KEYS.ACCESS_TOKEN) {
        authService.invalidateAuthAttempts("logout");
      }
      await originalSet(key, value);
    });

    const result = await useAuthStore.getState().verifyOtp("login", "handle_epoch", "123456");

    expect(result.ok).toBe(false);
    expect(result.code).toBe("STALE_EPOCH");
    expect(useAuthStore.getState().status).toBe("guest");
    expect(useAuthStore.getState().user).toBeNull();
    expect(cleanup).toHaveBeenCalledWith(sdkUser, 0);
    expect(profileRepository.refresh).not.toHaveBeenCalled();
    expect(link).not.toHaveBeenCalled();
    expect(await secureStorage.get(SECURE_KEYS.ACCESS_TOKEN)).toBeNull();
  });

  it("invalidates attempts before the awaited device unlink", async () => {
    useAuthStore.setState({
      status: "authenticated",
      user: USER,
      accessToken: "access",
      refreshToken: "refresh",
      challenge: null,
      isBootstrapped: true,
      error: null,
    });
    const order: string[] = [];
    vi.spyOn(authService, "invalidateAuthAttempts").mockImplementation(() => {
      order.push("invalidate");
    });
    vi.spyOn(notificationsService, "unlinkUserFromDeviceToken").mockImplementation(async () => {
      order.push("unlink");
      return { success: true, data: null } as any;
    });
    vi.spyOn(authRepository, "logout").mockImplementation(async () => {
      order.push("logout");
      return { success: true, data: null } as any;
    });

    await useAuthStore.getState().logout();

    expect(order).toEqual(["invalidate", "unlink", "logout"]);
  });
});
