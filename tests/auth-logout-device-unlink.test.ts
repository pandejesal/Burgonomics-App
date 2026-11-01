/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * F3 (P2 privacy) — logout must UNLINK the device token while the session is
 * still authenticated, and must await that call BEFORE signing out.
 *
 * Pre-fix: `void notificationsService.unlinkUserFromDeviceToken(uid).catch(...)`
 * ran concurrently with `authRepository.logout()`. Sign-out revoked the token
 * first, the unlink request went out unauthenticated, and device_tokens kept
 * pointing at the previous user — their order pushes reached the next person
 * on the device. The unlink must also never hold sign-out hostage.
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

import {
  useAuthStore,
  DEVICE_UNLINK_TIMEOUT_MS,
} from "../src/features/auth/state/authStore";
import { authRepository } from "../src/features/auth/repositories/AuthRepository";
import { notificationsService } from "../src/features/notifications/services/notificationsService";
import { profileRepository } from "../src/features/profile/repositories/ProfileRepository";
import { useProfileStore } from "../src/features/profile/state/profileStore";
import { secureStorage, SECURE_KEYS } from "../src/core/storage/secureStorage";

const USER = { id: "uid_old", phone: "+919825012345", name: "Old User" };

const setAuthed = () =>
  useAuthStore.setState({
    status: "authenticated",
    user: USER,
    accessToken: "access",
    refreshToken: "refresh_1",
    challenge: null,
    isBootstrapped: true,
    error: null,
  });

describe("authStore.logout — device-token unlink ordering (F3)", () => {
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
    await secureStorage.set(SECURE_KEYS.ACCESS_TOKEN, "access");
    await secureStorage.set(SECURE_KEYS.REFRESH_TOKEN, "refresh_1");
    await secureStorage.set(SECURE_KEYS.USER, JSON.stringify(USER));
    vi.spyOn(profileRepository, "refresh").mockResolvedValue({ success: true, data: null } as any);
    vi.spyOn(profileRepository, "clearCache").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("awaits the unlink BEFORE revoking auth, with the last uid", async () => {
    let unlinkSettled = false;
    const order: string[] = [];
    const unlink = vi
      .spyOn(notificationsService, "unlinkUserFromDeviceToken")
      .mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 5));
        unlinkSettled = true;
        order.push("unlink");
        return { success: true as const, data: null };
      });
    const signOut = vi.spyOn(authRepository, "logout").mockImplementation(async () => {
      // The load-bearing assertion: auth cannot be revoked before the
      // auth-gated unlink has completed.
      expect(unlinkSettled).toBe(true);
      order.push("logout");
      return { success: true as const, data: null };
    });

    setAuthed();
    await useAuthStore.getState().logout();

    expect(unlink).toHaveBeenCalledWith(USER.id);
    expect(signOut).toHaveBeenCalledWith("refresh_1");
    expect(order).toEqual(["unlink", "logout"]);
    expect(useAuthStore.getState().status).toBe("guest");
    expect(useAuthStore.getState().user).toBeNull();
    expect(await secureStorage.get(SECURE_KEYS.ACCESS_TOKEN)).toBeNull();
  });

  it("still signs out when the unlink fails (logout never blocks on push cleanup)", async () => {
    vi.spyOn(notificationsService, "unlinkUserFromDeviceToken").mockRejectedValue(
      new Error("network down"),
    );
    const signOut = vi
      .spyOn(authRepository, "logout")
      .mockResolvedValue({ success: true, data: null });

    setAuthed();
    await useAuthStore.getState().logout();

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe("guest");
  });

  it("signs out after the bounded timeout when the unlink hangs forever", async () => {
    vi.useFakeTimers();
    vi.spyOn(notificationsService, "unlinkUserFromDeviceToken").mockImplementation(
      () => new Promise(() => undefined) as any,
    );
    const signOut = vi
      .spyOn(authRepository, "logout")
      .mockResolvedValue({ success: true, data: null });

    setAuthed();
    const done = useAuthStore.getState().logout();

    // Give the promise chain a turn, confirm we are still waiting, then pass
    // the bound. Before the fix this promise could never settle.
    await vi.advanceTimersByTimeAsync(DEVICE_UNLINK_TIMEOUT_MS + 1);
    await done;

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe("guest");
  });

  it("skips the unlink for a guest (no uid)", async () => {
    const unlink = vi.spyOn(notificationsService, "unlinkUserFromDeviceToken");
    const signOut = vi
      .spyOn(authRepository, "logout")
      .mockResolvedValue({ success: true, data: null });

    await useAuthStore.getState().logout();

    expect(unlink).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("keeps uid-scoped caches on an ordinary logout (returning customer)", async () => {
    vi.spyOn(notificationsService, "unlinkUserFromDeviceToken").mockResolvedValue({
      success: true,
      data: null,
    } as any);
    vi.spyOn(authRepository, "logout").mockResolvedValue({ success: true, data: null });
    window.localStorage.setItem(`burg.addresses::${USER.id}`, "[]");

    setAuthed();
    await useAuthStore.getState().logout();

    expect(window.localStorage.getItem(`burg.addresses::${USER.id}`)).toBe("[]");
  });

  it("purges the deleted uid's caches (and only that uid's) when deletion signs out", async () => {
    vi.spyOn(notificationsService, "unlinkUserFromDeviceToken").mockResolvedValue({
      success: true,
      data: null,
    } as any);
    vi.spyOn(authRepository, "logout").mockResolvedValue({ success: true, data: null });

    const deleted = USER.id;
    const other = "uid_other";
    for (const base of ["burg.addresses", "burg.notifications", "burg.cart", "burg.checkout"]) {
      window.localStorage.setItem(`${base}::${deleted}`, "[]");
      window.localStorage.setItem(`${base}::${other}`, "[]");
    }
    window.localStorage.setItem(`burgonomics.loyalty.v1::${deleted}`, "{}");
    window.localStorage.setItem(`burgonomics.loyalty.v1::${other}`, "{}");

    setAuthed();
    await useAuthStore.getState().logout({ purgeLocalCaches: true });

    for (const base of ["burg.addresses", "burg.notifications", "burg.cart", "burg.checkout"]) {
      expect(window.localStorage.getItem(`${base}::${deleted}`)).toBeNull();
      expect(window.localStorage.getItem(`${base}::${other}`)).toBe("[]");
    }
    expect(window.localStorage.getItem(`burgonomics.loyalty.v1::${deleted}`)).toBeNull();
    expect(window.localStorage.getItem(`burgonomics.loyalty.v1::${other}`)).toBe("{}");
  });
});
