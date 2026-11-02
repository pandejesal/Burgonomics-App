/**
 * Items 3 & 4 (api-contract-audit).
 *
 * Item 3 — the dead /v1/notifications HTTP patches. The backend Express app
 * mounts no /v1 prefix and no mark-read route, so every tap fired a 404 before
 * the Firestore fallback ran. The Firestore writes are now the ONLY path.
 * firestore.rules allows them: users/{uid}/notifications allows `update` by the
 * owner with affectedKeys().hasOnly(['read','readAt','updatedAt'])
 * (customer firestore.rules:348-355) — exactly the fields written below.
 *
 * Item 4 — registerDeviceToken returned ok(null) on every failure, so push
 * registration could fail forever while looking healthy. It now returns a real
 * failure, still never throws, and callers must not block login/checkout.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateDoc, writeBatch, commit, getDocs, docRef, currentUser } = vi.hoisted(() => {
  const currentUser: { uid: string | null; getIdToken: () => Promise<string> } = {
    uid: "uid_item_3",
    getIdToken: async () => "id-token",
  };
  return {
    currentUser,
    updateDoc: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    getDocs: vi.fn(),
    writeBatch: vi.fn(),
    docRef: vi.fn((...args: unknown[]) => args),
  };
});

vi.mock("../src/core/config/firebase", () => ({
  auth: {
    get currentUser() {
      return currentUser.uid ? currentUser : null;
    },
  },
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  doc: docRef,
  collection: vi.fn((...args: unknown[]) => args),
  getDocs,
  updateDoc,
  writeBatch,
  serverTimestamp: () => "SERVER_TS",
}));

// A httpClient that records every call: the dead routes must never be dialled.
const { patch } = vi.hoisted(() => ({ patch: vi.fn() }));
vi.mock("../src/core/network/httpClient", () => ({
  httpClient: { patch },
}));

const { logger } = vi.hoisted(() => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/core/logging/logger", () => ({ logger }));

vi.mock("../src/core/config/env", () => ({
  appConfig: {
    env: "development",
    appName: "Burgonomics",
    appVersion: "1.0.0",
    api: { baseUrl: "https://test", timeoutMs: 15000, retry: { attempts: 2, backoffMs: 500 } },
    featureFlags: { offlineMode: false, orderTracking: true, referrals: false, adminOps: true },
    analytics: { enabled: false, writeKey: "" },
    push: { enabled: true, vapidPublicKey: "" },
    integrations: {
      razorpayKeyId: "",
      paymentsApiBaseUrl: "https://api.test/api/payments",
      petpoojaEnabled: false,
      mapsApiKey: "",
      firebaseConfig: "",
    },
  },
  isDev: () => true,
  isProd: () => false,
}));

vi.mock("../src/shared/platform/platform", () => ({ getPlatform: () => "android" }));
vi.mock("../src/shared/platform/pushNotifications", () => ({
  getCachedDeviceToken: () => null,
}));

import { notificationsService } from "../src/features/notifications/services/notificationsService";

beforeEach(() => {
  vi.clearAllMocks();
  currentUser.uid = "uid_item_3";
  writeBatch.mockReturnValue({
    update: vi.fn(),
    commit,
  });
});

describe("item 3 — mark-read never dials the dead /v1 routes", () => {
  it("markRead writes only the Firestore read receipt", async () => {
    const res = await notificationsService.markRead("notif_1");

    expect(res.success).toBe(true);
    expect(patch).not.toHaveBeenCalled();
    expect(updateDoc).toHaveBeenCalledTimes(1);
    // The rules field mask is hasOnly(['read','readAt','updatedAt']).
    expect(updateDoc.mock.lastCall?.[1]).toEqual({
      read: true,
      updatedAt: "SERVER_TS",
    });
  });

  it("markAllRead batches the Firestore writes and no HTTP patch", async () => {
    getDocs.mockResolvedValue({
      docs: [
        { data: () => ({ read: false }), ref: "users/uid_item_3/notifications/a" },
        { data: () => ({ read: true }), ref: "users/uid_item_3/notifications/b" },
      ],
    });

    const res = await notificationsService.markAllRead();

    expect(res.success).toBe(true);
    expect(patch).not.toHaveBeenCalled();
    expect(writeBatch).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
  });
});

describe("item 4 — registerDeviceToken reports a real failure", () => {
  it("returns fail() and logs when the server rejects the token", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const res = await notificationsService.registerDeviceToken("token-abcdefghij");

    expect(res.success).toBe(false);
    if (res.success) throw new Error("expected failure");
    expect(res.error.code).toBe("TOKEN_REGISTRATION_FAILED");
    expect(res.error.retryable).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("returns fail() for a network error instead of throwing", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const res = await notificationsService.registerDeviceToken("token-abcdefghij");

    expect(res.success).toBe(false);
    if (res.success) throw new Error("expected failure");
    expect(res.error.code).toBe("TOKEN_REGISTRATION_FAILED");
  });

  it("still succeeds on the server's 200 {success:true} envelope", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const res = await notificationsService.registerDeviceToken("token-abcdefghij");
    expect(res.success).toBe(true);
  });
});
