/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * C-02/F3 — logout unlink retry (B2).
 *
 * HTTP 401 at logout must write a bounded pending entry plus a retry-only
 * secure token copy, clear the operational cache, replay on the same-uid
 * boot, drop on SDK rotation, and never send an unlink under another uid.
 */
const { mockGetIdToken } = vi.hoisted(() => ({
  mockGetIdToken: vi.fn(async () => "id-token"),
}));

vi.mock("../src/core/config/firebase", () => ({
  auth: {
    get currentUser() {
      return { uid: "uid_a", getIdToken: mockGetIdToken };
    },
    authStateReady: async () => undefined,
  },
  db: {},
  app: {},
}));

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    doc: vi.fn(() => ({})),
    updateDoc: vi.fn(async () => undefined),
    arrayRemove: vi.fn(() => ({})),
    serverTimestamp: vi.fn(() => "ts"),
  };
});

import { useAuthStore } from "../src/features/auth/state/authStore";
import { authRepository } from "../src/features/auth/repositories/AuthRepository";
import { profileRepository } from "../src/features/profile/repositories/ProfileRepository";
import { secureStorage, SECURE_KEYS } from "../src/core/storage/secureStorage";
import {
  PENDING_UNLINK_MAX_ATTEMPTS,
  hashToken,
  readPendingUnlink,
  reconcilePendingUnlinkOnRegistration,
  retryPendingUnlinkOnBoot,
  writePendingUnlink,
} from "../src/features/notifications/services/pendingUnlink";

const USER = { id: "uid_a", phone: "+919825012345", name: "Test User" };
const fetchMock = vi.fn();

function jsonResponse(status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
  } as unknown as Response;
}

function setAuthed(uid = USER.id) {
  useAuthStore.setState({
    status: "authenticated",
    user: { ...USER, id: uid },
    accessToken: "access",
    refreshToken: "refresh_1",
    challenge: null,
    isBootstrapped: true,
    error: null,
  });
}

beforeEach(async () => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  window.localStorage.clear();
  await secureStorage.remove(SECURE_KEYS.PENDING_UNLINK_TOKEN);
  useAuthStore.setState({
    status: "idle",
    user: null,
    accessToken: null,
    refreshToken: null,
    challenge: null,
    isBootstrapped: false,
    error: null,
  });
  mockGetIdToken.mockReset();
  mockGetIdToken.mockResolvedValue("id-token");
  vi.spyOn(authRepository, "logout").mockResolvedValue({ success: true, data: null } as any);
  vi.spyOn(profileRepository, "clearCache").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("C-02 logout unlink on HTTP 401", () => {
  it("records a retry-only token copy and clears the operational cache", async () => {
    window.localStorage.setItem("burg.device_token", "tok_secure_1");
    fetchMock.mockResolvedValue(jsonResponse(401));

    setAuthed();
    await useAuthStore.getState().logout();

    const record = readPendingUnlink();
    expect(record).toMatchObject({
      uid: "uid_a",
      attempts: 0,
      reason: "failed",
    });
    expect(record?.tokenHash).toBe(await hashToken("tok_secure_1"));
    expect(await secureStorage.get(SECURE_KEYS.PENDING_UNLINK_TOKEN)).toBe("tok_secure_1");
    expect(window.localStorage.getItem("burg.device_token")).toBeNull();
  });
});

describe("C-02 same-uid boot replay", () => {
  it("issues a real unlink from the secure copy on the next same-uid boot", async () => {
    await writePendingUnlink({ uid: "uid_a", token: "tok_retry", reason: "timeout" });
    fetchMock.mockResolvedValue(jsonResponse(200));

    const result = await retryPendingUnlinkOnBoot("uid_a");

    expect(result).toBe("unlinked");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/notifications/unregisterToken");
    expect(JSON.parse(String(init.body))).toEqual({ token: "tok_retry" });
    expect(readPendingUnlink()).toBeNull();
    expect(await secureStorage.get(SECURE_KEYS.PENDING_UNLINK_TOKEN)).toBeNull();
  });

  it("drops the entry instead of sending under another uid's JWT", async () => {
    await writePendingUnlink({ uid: "uid_a", token: "tok_cross", reason: "failed" });
    fetchMock.mockResolvedValue(jsonResponse(200));

    const result = await retryPendingUnlinkOnBoot("uid_b");

    expect(result).toBe("dropped");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readPendingUnlink()).toBeNull();
    expect(await secureStorage.get(SECURE_KEYS.PENDING_UNLINK_TOKEN)).toBeNull();
  });

  it("bounds retries at three attempts", async () => {
    await writePendingUnlink({ uid: "uid_a", token: "tok_loop", reason: "failed" });
    fetchMock.mockResolvedValue(jsonResponse(401));

    for (let attempt = 1; attempt <= PENDING_UNLINK_MAX_ATTEMPTS; attempt += 1) {
      fetchMock.mockClear();
      await retryPendingUnlinkOnBoot("uid_a");
    }

    expect(readPendingUnlink()).toBeNull();
    expect(await secureStorage.get(SECURE_KEYS.PENDING_UNLINK_TOKEN)).toBeNull();
  });
});

describe("C-02 SDK token rotation", () => {
  it("drops a rotated token entry without an unlink loop", async () => {
    setAuthed();
    await writePendingUnlink({ uid: "uid_a", token: "tok_old", reason: "failed" });
    fetchMock.mockResolvedValue(jsonResponse(200));

    const result = await reconcilePendingUnlinkOnRegistration("tok_new");

    expect(result).toBe("dropped");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readPendingUnlink()).toBeNull();
    expect(await secureStorage.get(SECURE_KEYS.PENDING_UNLINK_TOKEN)).toBeNull();
  });

  it("unlinks then lets the caller associate when the SDK token matches", async () => {
    setAuthed();
    await writePendingUnlink({ uid: "uid_a", token: "tok_match", reason: "failed" });
    fetchMock.mockResolvedValue(jsonResponse(200));

    const result = await reconcilePendingUnlinkOnRegistration("tok_match");

    expect(result).toBe("unlinked");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({
      token: "tok_match",
    });
    expect(readPendingUnlink()).toBeNull();
  });
});
