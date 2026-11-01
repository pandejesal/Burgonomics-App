/**
 * Integration tests for the real preferences wire contract.
 *
 * Backend authority (polish-backend-20261025):
 * - POST /notifications/preferences
 *   body { installationId, notificationPrefs, expectedVersion, mutationId? }
 *   strict schema: no uid/category/prefs alias
 * - GET /notifications/preferences?installationId=...
 *   -> { notificationPrefs, version }
 *
 * These tests stub fetch (not notificationsService), so a method/path/body
 * mismatch cannot hide behind a service mock.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/core/config/firebase", () => ({
  auth: {
    currentUser: {
      getIdToken: async () => "id-token",
    },
    authStateReady: async () => undefined,
  },
  db: {},
  app: {},
}));

import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "../src/features/notifications/services/notificationsService";
import type { NotificationPreferences } from "../src/features/settings/models";
import { NOTIFICATION_PREFERENCE_DEFAULTS } from "../src/features/settings/models";

const PREFS: NotificationPreferences = {
  offers: true,
  orderUpdates: true,
  announcements: false,
  supportReplies: true,
};

const PREFS_ALT: NotificationPreferences = {
  offers: false,
  orderUpdates: true,
  announcements: true,
  supportReplies: false,
};

const INSTALLATION_ID = "install_12345678";

const fetchMock = vi.fn();

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("preferences write wire contract", () => {
  it("uses POST /notifications/preferences with notificationPrefs and no uid/prefs alias", async () => {
    fetchMock.mockResolvedValueOnce(
      response(200, {
        replicated: false,
        version: 1,
        prefs: PREFS,
        currentVersion: 1,
        currentPrefs: PREFS,
        stale: false,
      }),
    );

    const result = await updateNotificationPreferences({
      installationId: INSTALLATION_ID,
      prefs: PREFS,
      expectedVersion: 0,
      mutationId: "mutation_12345678",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(new URL(url).pathname.endsWith("/notifications/preferences")).toBe(true);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      "expectedVersion",
      "installationId",
      "mutationId",
      "notificationPrefs",
    ]);
    expect(body.installationId).toBe(INSTALLATION_ID);
    expect(body.notificationPrefs).toEqual(PREFS);
    expect(body.expectedVersion).toBe(0);
    expect(body.mutationId).toBe("mutation_12345678");
    expect(body).not.toHaveProperty("prefs");
    expect(body).not.toHaveProperty("uid");
    expect(body).not.toHaveProperty("category");
    expect(result).toEqual({
      status: "synced",
      exists: true,
      version: 1,
      prefs: PREFS,
      replicated: false,
      stale: false,
    });
  });

  it("a write 404 is a terminal failure, not retryable pending", async () => {
    fetchMock.mockResolvedValueOnce(response(404, { error: "Not found" }));
    const result = await updateNotificationPreferences({
      installationId: INSTALLATION_ID,
      prefs: PREFS,
      expectedVersion: 0,
      mutationId: "mutation_12345678",
    });
    expect(result).toEqual({ status: "failed", code: "not_found" });
    expect(result.status).not.toBe("retryable");
  });

  it("a strict-schema 400 is a terminal bad_request", async () => {
    fetchMock.mockResolvedValueOnce(response(400, { error: "notificationPrefs required" }));
    const result = await updateNotificationPreferences({
      installationId: INSTALLATION_ID,
      prefs: PREFS,
      expectedVersion: 0,
      mutationId: "mutation_12345678",
    });
    expect(result).toEqual({ status: "failed", code: "bad_request" });
  });

  it("maps write 401/403 to terminal auth states", async () => {
    fetchMock.mockResolvedValueOnce(response(401, { error: "Unauthorized" }));
    await expect(
      updateNotificationPreferences({
        installationId: INSTALLATION_ID,
        prefs: PREFS,
        expectedVersion: 0,
        mutationId: "mutation_12345678",
      }),
    ).resolves.toEqual({ status: "unauthorized" });

    fetchMock.mockResolvedValueOnce(response(403, { error: "Forbidden" }));
    await expect(
      updateNotificationPreferences({
        installationId: INSTALLATION_ID,
        prefs: PREFS,
        expectedVersion: 0,
        mutationId: "mutation_12345678",
      }),
    ).resolves.toEqual({ status: "forbidden" });
  });

  it("keeps 5xx and network failures retryable/pending", async () => {
    fetchMock.mockResolvedValueOnce(response(503, { error: "unavailable" }));
    await expect(
      updateNotificationPreferences({
        installationId: INSTALLATION_ID,
        prefs: PREFS,
        expectedVersion: 0,
        mutationId: "mutation_12345678",
      }),
    ).resolves.toEqual({ status: "retryable", code: "server" });

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(
      updateNotificationPreferences({
        installationId: INSTALLATION_ID,
        prefs: PREFS,
        expectedVersion: 0,
        mutationId: "mutation_12345678",
      }),
    ).resolves.toEqual({ status: "retryable", code: "offline" });
  });

  it("parses the amended 409 envelope with currentVersion/currentPrefs", async () => {
    fetchMock.mockResolvedValueOnce(
      response(409, {
        error: "preferences version conflict",
        code: "PREF_VERSION_CONFLICT",
        currentVersion: 4,
        currentPrefs: PREFS_ALT,
      }),
    );

    const result = await updateNotificationPreferences({
      installationId: INSTALLATION_ID,
      prefs: PREFS,
      expectedVersion: 1,
      mutationId: "mutation_12345678",
    });

    expect(result).toEqual({
      status: "conflict",
      currentVersion: 4,
      currentPrefs: PREFS_ALT,
      code: "PREF_VERSION_CONFLICT",
    });
  });

  it("recovers a versionless 409 through the canonical GET, never inventing 0", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response(409, { error: "preferences version conflict", code: "PREF_VERSION_CONFLICT" }),
      )
      .mockResolvedValueOnce(response(200, { notificationPrefs: PREFS_ALT, version: 9 }));

    const result = await updateNotificationPreferences({
      installationId: INSTALLATION_ID,
      prefs: PREFS,
      expectedVersion: 1,
      mutationId: "mutation_12345678",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [getUrl, getInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(getInit.method).toBe("GET");
    const parsedGet = new URL(getUrl);
    expect(parsedGet.pathname.endsWith("/notifications/preferences")).toBe(true);
    expect(parsedGet.searchParams.get("installationId")).toBe(INSTALLATION_ID);
    expect(result).toEqual({
      status: "conflict",
      currentVersion: 9,
      currentPrefs: PREFS_ALT,
      code: "PREF_VERSION_CONFLICT",
    });
  });
});

describe("preferences canonical read wire contract", () => {
  it("uses GET with installationId and maps notificationPrefs/version", async () => {
    fetchMock.mockResolvedValueOnce(
      response(200, { notificationPrefs: PREFS, version: 7 }),
    );

    const result = await getNotificationPreferences(INSTALLATION_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("GET");
    const parsed = new URL(url);
    expect(parsed.pathname.endsWith("/notifications/preferences")).toBe(true);
    expect(parsed.searchParams.get("installationId")).toBe(INSTALLATION_ID);
    expect(result).toEqual({
      status: "synced",
      exists: true,
      version: 7,
      prefs: PREFS,
      replicated: false,
      stale: false,
    });
  });

  it("maps a never-saved account (exists:false, version:0) without inventing a save", async () => {
    fetchMock.mockResolvedValueOnce(response(200, { exists: false, version: 0 }));

    const result = await getNotificationPreferences(INSTALLATION_ID);

    expect(result).toEqual({
      status: "synced",
      exists: false,
      version: 0,
      prefs: NOTIFICATION_PREFERENCE_DEFAULTS,
      replicated: false,
      stale: false,
    });
  });

  it("a GET 404 is a real failure, not an empty record", async () => {
    fetchMock.mockResolvedValueOnce(response(404, { error: "Not found" }));
    const result = await getNotificationPreferences(INSTALLATION_ID);
    expect(result).toEqual({ status: "failed", code: "not_found" });
  });

  it("maps GET 401/403 to terminal auth states", async () => {
    fetchMock.mockResolvedValueOnce(response(401, { error: "Unauthorized" }));
    await expect(getNotificationPreferences(INSTALLATION_ID)).resolves.toEqual({
      status: "unauthorized",
    });

    fetchMock.mockResolvedValueOnce(response(403, { error: "Forbidden" }));
    await expect(getNotificationPreferences(INSTALLATION_ID)).resolves.toEqual({
      status: "forbidden",
    });
  });

  it("keeps GET 5xx/offline retryable", async () => {
    fetchMock.mockResolvedValueOnce(response(500, { error: "boom" }));
    await expect(getNotificationPreferences(INSTALLATION_ID)).resolves.toEqual({
      status: "retryable",
      code: "server",
    });

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(getNotificationPreferences(INSTALLATION_ID)).resolves.toEqual({
      status: "retryable",
      code: "offline",
    });
  });
});
