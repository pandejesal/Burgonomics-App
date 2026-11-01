/**
 * CUS-05 — FCM device-token unlinking must finish before sign-out.
 *
 * The unregister call authenticates with the CURRENT Firebase user's ID token,
 * so it has to complete while the session still exists. It used to be
 * fire-and-forget (`void ...unlinkUserFromDeviceToken(...)`) immediately
 * followed by `authRepository.logout()`, which races: by the time the unregister
 * fetch asks for a token, `auth.currentUser` is null and the device token stays
 * linked to the account that just signed out — later pushes land on the device.
 *
 * Requirement: await it, bounded by a short timeout, and still complete the
 * sign-out when unregistering fails or never answers.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  unlink: vi.fn(),
  link: vi.fn(),
  logout: vi.fn(async () => ({ success: true as const, data: null })),
  clearCache: vi.fn(),
  warn: vi.fn(),
  remove: vi.fn(async () => {}),
}));

vi.mock("@/features/notifications/services/notificationsService", () => ({
  notificationsService: {
    unlinkUserFromDeviceToken: fixture.unlink,
    linkUserToDeviceToken: fixture.link,
  },
}));
vi.mock("@/features/auth/repositories/AuthRepository", () => ({
  authRepository: {
    logout: fixture.logout,
    cancelChallenge: vi.fn(),
    clearRecaptcha: vi.fn(),
    initRecaptcha: vi.fn(),
  },
}));
vi.mock("@/features/profile/repositories/ProfileRepository", () => ({
  profileRepository: { clearCache: fixture.clearCache, refresh: vi.fn() },
}));
vi.mock("@/core/storage/secureStorage", () => ({
  secureStorage: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => {}),
    remove: fixture.remove,
  },
  SECURE_KEYS: {
    ACCESS_TOKEN: "access",
    REFRESH_TOKEN: "refresh",
    USER: "user",
  },
}));
vi.mock("@/core/logging/logger", () => ({
  logger: { warn: fixture.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { DEVICE_UNLINK_TIMEOUT_MS, useAuthStore } from "@/features/auth/state/authStore";

const USER = { id: "usr_cus05", phone: "+919825012345", name: "Test" };

beforeEach(() => {
  vi.clearAllMocks();
  fixture.unlink.mockReset();
  fixture.logout.mockReset();
  fixture.logout.mockResolvedValue({ success: true, data: null });
  useAuthStore.setState({
    status: "authenticated",
    user: USER,
    accessToken: "access_token",
    refreshToken: "refresh_token",
    challenge: null,
    isBootstrapped: true,
    error: null,
  });
});

describe("CUS-05 — device token is unlinked before sign-out", () => {
  it("awaits the unlink before signing out", async () => {
    let resolveUnlink: ((value: unknown) => void) | undefined;
    fixture.unlink.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUnlink = resolve;
        }),
    );

    const signingOut = useAuthStore.getState().logout();
    // Let logout reach the awaited unlink.
    await Promise.resolve();
    await Promise.resolve();

    expect(fixture.unlink).toHaveBeenCalledWith(USER.id);
    // The race this finding describes: sign-out must NOT already have happened.
    expect(fixture.logout).not.toHaveBeenCalled();

    resolveUnlink?.({ success: true, data: null });
    await signingOut;

    expect(fixture.logout).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe("guest");
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("still signs out when the unlink never answers (bounded timeout)", async () => {
    vi.useFakeTimers();
    try {
      fixture.unlink.mockImplementation(() => new Promise(() => {}));

      const signingOut = useAuthStore.getState().logout();
      await vi.advanceTimersByTimeAsync(DEVICE_UNLINK_TIMEOUT_MS + 10);
      await signingOut;

      expect(fixture.logout).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().status).toBe("guest");
    } finally {
      vi.useRealTimers();
    }
  });

  it("still signs out when the unlink fails", async () => {
    fixture.unlink.mockRejectedValue(new Error("network down"));

    await useAuthStore.getState().logout();

    expect(fixture.logout).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe("guest");
    expect(fixture.warn).toHaveBeenCalledWith(
      "auth.device_unlink_failed",
      expect.objectContaining({ message: "network down" }),
    );
  });
});
