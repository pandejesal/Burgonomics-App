// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useAuthStore } from "../src/features/auth/state/authStore";
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
      otpToken: "handle_epoch",
      phone: USER.phone,
      requestedAt: Date.now(),
      resendAfterSec: 60,
      deliveryMethod: "sms",
    },
    isBootstrapped: true,
    error: null,
  });
}

describe("authStore epoch gate and logout ordering", () => {
  beforeEach(() => {
    useAuthStore.getState().changePhone();
    seedChallenge();
    vi.spyOn(profileRepository, "refresh").mockResolvedValue({ success: true, data: null } as any);
    vi.spyOn(profileRepository, "clearCache").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().changePhone();
  });

  it("re-checks the epoch after persistSession and never hydrates profile on a stale commit", async () => {
    const sessionRef = { uid: USER.id, refreshToken: "refresh" };
    vi.spyOn(authRepository, "verifyOtp").mockResolvedValue({
      success: true,
      data: {
        user: USER,
        accessToken: "access",
        refreshToken: "refresh",
        sessionRef,
      },
    } as any);
    const cleanup = vi
      .spyOn(authRepository, "discardConfirmedSession")
      .mockResolvedValue(undefined);
    const link = vi.spyOn(notificationsService, "linkUserToDeviceToken").mockResolvedValue({
      success: true,
      data: null,
    } as any);

    const originalSet = secureStorage.set.bind(secureStorage);
    vi.spyOn(secureStorage, "set").mockImplementation(async (key, value) => {
      if (key === SECURE_KEYS.ACCESS_TOKEN) {
        useAuthStore.getState().changePhone();
      }
      await originalSet(key, value);
    });

    const result = await useAuthStore.getState().verifyOtp("123456");

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Verification was cancelled.");
    expect(useAuthStore.getState().status).toBe("unauthenticated");
    expect(useAuthStore.getState().user).toBeNull();
    expect(cleanup).toHaveBeenCalledWith(sessionRef);
    expect(profileRepository.refresh).not.toHaveBeenCalled();
    expect(link).not.toHaveBeenCalled();
    expect(await secureStorage.get(SECURE_KEYS.ACCESS_TOKEN)).toBeNull();
  });

  it("invalidates attempts before the awaited device unlink", async () => {
    let finishVerify!: (value: any) => void;
    const pendingVerify = new Promise<any>((resolve) => {
      finishVerify = resolve;
    });
    vi.spyOn(authRepository, "verifyOtp").mockReturnValue(pendingVerify);
    const verifying = useAuthStore.getState().verifyOtp("123456");
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
    const cleanup = vi
      .spyOn(authRepository, "discardConfirmedSession")
      .mockResolvedValue(undefined);
    const sessionRef = { uid: "stale_uid", refreshToken: "stale_refresh" };
    vi.spyOn(notificationsService, "unlinkUserFromDeviceToken").mockImplementation(async () => {
      order.push("unlink");
      // Resolve the old verify *during* the unlink await. It is already fenced.
      finishVerify({
        success: true,
        data: {
          user: { ...USER, id: "stale_uid" },
          accessToken: "stale_access",
          refreshToken: "stale_refresh",
          sessionRef,
        },
      });
      expect((await verifying).ok).toBe(false);
      expect(useAuthStore.getState().user?.id).toBe(USER.id);
      return "ok";
    });
    vi.spyOn(authRepository, "logout").mockImplementation(async () => {
      order.push("logout");
      return { success: true, data: null } as any;
    });

    await useAuthStore.getState().logout();

    expect(order).toEqual(["unlink", "logout"]);
    expect(cleanup).toHaveBeenCalledWith(sessionRef);
    expect(useAuthStore.getState().status).toBe("guest");
    expect(useAuthStore.getState().user).toBeNull();
  });
});
