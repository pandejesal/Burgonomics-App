/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * A6/A3-c11 item 5: the WEB build must not keep a Firebase credential in
 * plaintext `localStorage`, and must still restore an intact session.
 *
 * Two halves, both against the REAL authStore:
 *  1. no token is ever written to web storage, and a legacy plaintext copy is
 *     scrubbed on boot (see tests/secure-storage-web-tokens.test.ts for the
 *     storage-level assertions);
 *  2. because nothing is persisted, bootstrap rebuilds the session from the
 *     LIVE Firebase user (Firebase Auth's own IndexedDB persistence). A stolen
 *     localStorage copy with NO live session still boots to guest.
 */
import { useAuthStore, type LiveFirebaseSession } from "../src/features/auth/state/authStore";
import { secureStorage, SECURE_KEYS } from "../src/core/storage/secureStorage";
import { profileRepository } from "../src/features/profile/repositories/ProfileRepository";
import { notificationsService } from "../src/features/notifications/services/notificationsService";
import { ok } from "../src/core/network/http";

const USER = { id: "uid_web_token", phone: "+919825012345" };

const liveSession = (overrides: Partial<LiveFirebaseSession> = {}): LiveFirebaseSession => ({
  uid: USER.id,
  phone: USER.phone,
  accessToken: "live-access-token",
  refreshToken: "live-refresh-token",
  ...overrides,
});

function resetStore() {
  useAuthStore.setState({
    status: "idle",
    user: null,
    accessToken: null,
    refreshToken: null,
    challenge: null,
    isBootstrapped: false,
    error: null,
  });
}

describe("authStore.bootstrap web token persistence (A3-c11 item 2)", () => {
  let profileRefresh: ReturnType<typeof vi.spyOn>;
  let deviceLink: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    resetStore();
    window.localStorage.clear();
    profileRefresh = vi.spyOn(profileRepository, "refresh").mockResolvedValue(ok(null));
    deviceLink = vi
      .spyOn(notificationsService, "linkUserToDeviceToken")
      .mockResolvedValue(ok(null));
    await secureStorage.remove(SECURE_KEYS.ACCESS_TOKEN);
    await secureStorage.remove(SECURE_KEYS.REFRESH_TOKEN);
    await secureStorage.remove(SECURE_KEYS.USER);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("never persists a token to localStorage while signing a session in", async () => {
    await useAuthStore.getState().bootstrap(
      async () => null,
      async () => liveSession(),
    );

    const s = useAuthStore.getState();
    expect(s.status).toBe("authenticated");
    expect(s.accessToken).toBe("live-access-token");
    // The whole plaintext surface stays clean.
    expect(window.localStorage.getItem("burg.secure.auth.accessToken")).toBeNull();
    expect(window.localStorage.getItem("burg.secure.auth.refreshToken")).toBeNull();
    expect(JSON.stringify(Object.entries(window.localStorage))).not.toContain("live-refresh-token");
  });

  it("restores an intact session from the LIVE Firebase user", async () => {
    await useAuthStore.getState().bootstrap(
      async () => USER.id,
      async () => liveSession(),
    );

    const s = useAuthStore.getState();
    expect(s.status).toBe("authenticated");
    expect(s.user?.id).toBe(USER.id);
    expect(s.accessToken).toBe("live-access-token");
    // The background seams fire for this identity, so the restore is complete.
    expect(profileRefresh).toHaveBeenCalled();
    expect(deviceLink).toHaveBeenCalledWith(USER.id);
  });

  it("boots to guest when there is neither a stored nor a live session", async () => {
    await useAuthStore.getState().bootstrap(
      async () => null,
      async () => null,
    );
    expect(useAuthStore.getState().status).toBe("guest");
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("scrubs a legacy plaintext token on boot", async () => {
    window.localStorage.setItem("burg.secure.auth.accessToken", "legacy-plaintext");
    window.localStorage.setItem("burg.secure.auth.refreshToken", "legacy-refresh");

    await useAuthStore.getState().bootstrap(
      async () => null,
      async () => null,
    );

    expect(window.localStorage.getItem("burg.secure.auth.accessToken")).toBeNull();
    expect(window.localStorage.getItem("burg.secure.auth.refreshToken")).toBeNull();
  });
});
