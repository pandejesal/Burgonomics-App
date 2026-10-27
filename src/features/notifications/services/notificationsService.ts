import { delay, ok, type ApiResult } from "@/core/network/http";
import { httpClient } from "@/core/network/httpClient";
import { auth } from "@/core/config/firebase";
import type { AppNotification } from "@/features/notifications/state/notificationsStore";
import {
  NOTIFICATION_PREFERENCE_DEFAULTS,
  type NotificationPreferences,
} from "@/features/settings/models";
import { getPlatform } from "@/shared/platform/platform";
import { getCachedDeviceToken } from "@/shared/platform/pushNotifications";
import { logger } from "@/core/logging/logger";

/** Best-effort Firebase ID token for authenticated notification calls. */
async function authHeaders(): Promise<Record<string, string>> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) return { Authorization: `Bearer ${token}` };
  } catch {
    // Offline / token fetch failed — server decides as unauthenticated.
  }
  return {};
}

async function getIdToken(): Promise<string | null> {
  try {
    return (await auth.currentUser?.getIdToken()) ?? null;
  } catch {
    return null;
  }
}

/** Base URL for the server-owned notification routes (register/unregister/prefs). */
let cachedApiBase: string | null = null;

async function resolveApiBase(): Promise<string> {
  if (cachedApiBase) return cachedApiBase;
  const { appConfig } = await import("@/core/config/env");
  const paymentsBase = (
    appConfig.integrations.paymentsApiBaseUrl ||
    "https://asia-south1-burgonomics-7faa8.cloudfunctions.net/api/payments"
  ).replace(/\/$/, "");
  cachedApiBase = paymentsBase.endsWith("/payments")
    ? paymentsBase.slice(0, -"/payments".length)
    : paymentsBase;
  return cachedApiBase;
}

export type DeviceUnlinkOutcome = "ok" | "failed";

export type NotificationPreferencesSyncResult =
  | {
      status: "synced";
      /** False when the canonical read says this installation has never saved. */
      exists: boolean;
      version: number;
      prefs: NotificationPreferences;
      replicated: boolean;
      stale: boolean;
    }
  | {
      status: "conflict";
      /** Null when the backend's 409 envelope omitted it and the canonical
       * read could not recover it. Callers must NOT coerce this to 0. */
      currentVersion: number | null;
      currentPrefs: NotificationPreferences | null;
      code: string | null;
    }
  | { status: "unauthorized" }
  | { status: "forbidden" }
  | { status: "retryable"; code: "offline" | "server" }
  | { status: "failed"; code: "not_found" | "bad_request" | "invalid_response" };

export interface NotificationPreferencesSyncInput {
  installationId: string;
  prefs: NotificationPreferences;
  expectedVersion: number;
  mutationId: string;
}

function parseNotificationPreferences(value: unknown): NotificationPreferences | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const orderUpdates =
    typeof source.orderUpdates === "boolean"
      ? source.orderUpdates
      : typeof source.orders === "boolean"
        ? source.orders
        : null;
  if (
    typeof source.offers !== "boolean" ||
    typeof source.announcements !== "boolean" ||
    typeof source.supportReplies !== "boolean" ||
    orderUpdates === null
  ) {
    return null;
  }
  return {
    offers: source.offers,
    orderUpdates,
    announcements: source.announcements,
    supportReplies: source.supportReplies,
  };
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await response.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function prefsFromBody(body: Record<string, unknown> | null): NotificationPreferences | null {
  return parseNotificationPreferences(body?.notificationPrefs ?? body?.prefs);
}

/**
 * Parses the 409 envelope. The landed backend currently sends only
 * `{error, code}`; it is being amended to include `currentVersion` and
 * `currentPrefs`. A missing version is represented as `null` and must never be
 * coerced to 0 — that would rebase a CAS write onto a non-existent version and
 * loop forever.
 */
function parseConflictBody(body: Record<string, unknown> | null): {
  currentVersion: number | null;
  currentPrefs: NotificationPreferences | null;
  code: string | null;
} {
  return {
    currentVersion:
      typeof body?.currentVersion === "number" && Number.isInteger(body.currentVersion)
        ? body.currentVersion
        : null,
    currentPrefs: parseNotificationPreferences(body?.currentPrefs),
    code: typeof body?.code === "string" ? body.code : null,
  };
}

/**
 * Canonical read. Backend path (authoritative): GET
 * /notifications/preferences?installationId=... -> { notificationPrefs, version }.
 * A 404 is a route/build mismatch, not "no record": it is surfaced as a
 * terminal failure so the UI cannot fake a saved state forever.
 */
export async function getNotificationPreferences(
  installationId: string,
): Promise<NotificationPreferencesSyncResult> {
  const idToken = await getIdToken();
  if (!idToken) return { status: "unauthorized" };
  const path = `/notifications/preferences?installationId=${encodeURIComponent(installationId)}`;
  try {
    const base = await resolveApiBase();
    const response = await fetch(`${base}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (response.status === 401) return { status: "unauthorized" };
    if (response.status === 403) return { status: "forbidden" };
    if (response.status === 404) {
      logger.warn("notifications.preferencesReadRouteMissing", {
        method: "GET",
        path: "/notifications/preferences",
        status: 404,
      });
      return { status: "failed", code: "not_found" };
    }
    if (response.status === 409) {
      const body = await readJson(response);
      return { status: "conflict", ...parseConflictBody(body) };
    }
    if (response.status === 400) {
      logger.warn("notifications.preferencesReadRejected", {
        method: "GET",
        path: "/notifications/preferences",
        status: 400,
      });
      return { status: "failed", code: "bad_request" };
    }
    if (!response.ok) {
      if (response.status >= 500) {
        logger.warn("notifications.preferencesReadFailed", { status: response.status });
        return { status: "retryable", code: "server" };
      }
      logger.warn("notifications.preferencesReadRejected", {
        method: "GET",
        path: "/notifications/preferences",
        status: response.status,
      });
      return { status: "failed", code: "bad_request" };
    }
    const body = await readJson(response);
    const exists = body?.exists !== false;
    const prefs =
      prefsFromBody(body) ??
      (exists ? null : { ...NOTIFICATION_PREFERENCE_DEFAULTS });
    if (!prefs || typeof body?.version !== "number") {
      logger.warn("notifications.preferencesReadInvalidResponse");
      return { status: "failed", code: "invalid_response" };
    }
    return {
      status: "synced",
      exists,
      version: body.version,
      prefs,
      replicated: body.replicated === true,
      stale: body.stale === true,
    };
  } catch (err: unknown) {
    logger.warn("notifications.preferencesReadError", {
      message: err instanceof Error ? err.message : String(err),
    });
    return { status: "retryable", code: "offline" };
  }
}

/**
 * CAS save of the device preferences. Backend path (authoritative): POST
 * /notifications/preferences with `{installationId, notificationPrefs,
 * expectedVersion, mutationId?}` and a strict body (no uid/category/prefs
 * alias). `expectedVersion: 0` creates at v1; a mismatch is a 409.
 */
export async function updateNotificationPreferences(
  input: NotificationPreferencesSyncInput,
): Promise<NotificationPreferencesSyncResult> {
  const idToken = await getIdToken();
  if (!idToken) return { status: "unauthorized" };
  const path = "/notifications/preferences";
  try {
    const base = await resolveApiBase();
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        installationId: input.installationId,
        notificationPrefs: input.prefs,
        expectedVersion: input.expectedVersion,
        mutationId: input.mutationId,
      }),
    });
    if (response.status === 401) return { status: "unauthorized" };
    if (response.status === 403) return { status: "forbidden" };
    if (response.status === 404) {
      logger.warn("notifications.preferencesWriteRouteMissing", {
        method: "POST",
        path,
        status: 404,
      });
      return { status: "failed", code: "not_found" };
    }
    if (response.status === 400) {
      logger.warn("notifications.preferencesWriteRejected", {
        method: "POST",
        path,
        status: 400,
      });
      return { status: "failed", code: "bad_request" };
    }
    if (response.status === 409) {
      const body = await readJson(response);
      const conflict = parseConflictBody(body);
      if (conflict.currentVersion === null) {
        // Current backend drops the version. Recover it through the canonical
        // read (once the backend GET lands) instead of inventing version 0.
        const canonical = await getNotificationPreferences(input.installationId);
        if (canonical.status === "synced") {
          return {
            status: "conflict",
            currentVersion: canonical.version,
            currentPrefs: canonical.prefs,
            code: conflict.code,
          };
        }
      }
      logger.warn("notifications.preferencesConflict", {
        code: conflict.code,
        hasCurrentVersion: conflict.currentVersion !== null,
        hasCurrentPrefs: conflict.currentPrefs !== null,
      });
      return { status: "conflict", ...conflict };
    }
    if (!response.ok) {
      if (response.status >= 500) {
        logger.warn("notifications.preferencesWriteFailed", { status: response.status });
        return { status: "retryable", code: "server" };
      }
      logger.warn("notifications.preferencesWriteRejected", {
        method: "POST",
        path,
        status: response.status,
      });
      return { status: "failed", code: "bad_request" };
    }
    const body = await readJson(response);
    const prefs = prefsFromBody(body);
    if (!prefs || typeof body?.version !== "number") {
      logger.warn("notifications.preferencesWriteInvalidResponse");
      return { status: "failed", code: "invalid_response" };
    }
    return {
      status: "synced",
      // A write response means a server record exists; `exists` is advisory.
      exists: body?.exists !== false,
      version: body.version,
      prefs,
      replicated: body.replicated === true,
      stale: body.stale === true,
    };
  } catch (err: unknown) {
    logger.warn("notifications.preferencesWriteError", {
      message: err instanceof Error ? err.message : String(err),
    });
    return { status: "retryable", code: "offline" };
  }
}

export const notificationsService = {
  async list(): Promise<ApiResult<AppNotification[]>> {
    await delay(120);
    return ok([]);
  },

  /**
   * Badge-clear binding (MOP-S2, B5-S1 follow-up 4 core half).
   *
   * Brief contract: badge clears via the markRead endpoint —
   *   PATCH /v1/notifications/:id/read
   * Landed contract in this tree: NO HTTP notifications route exists
   * (Firebase Cloud Functions v2 serves payments/porter/petpooja/account;
   * legacy Netlify functions were removed 2026-09-23);
   * the in-app source of truth is Firestore `users/{uid}/notifications`
   * (firestore.rules:90-93, writable by the owning uid).
   *
   * Runtime guard: try the HTTP endpoint first; when the route is absent
   * (404/NetworkError/OfflineError — or no base URL configured) degrade to
   * a direct Firestore `read: true` write; when Firestore is also
   * unavailable (signed out / offline) resolve ok anyway so the caller
   * still clears the local badge (queued/degraded path). Never throws,
   * never fabricates a server confirmation.
   */
  async markRead(id: string): Promise<ApiResult<{ id: string }>> {
    const headers = await authHeaders();
    try {
      await httpClient.patch(`/v1/notifications/${encodeURIComponent(id)}/read`, {}, { headers });
      return ok({ id });
    } catch {
      // HTTP route absent — fall through to the landed Firestore contract.
    }
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return ok({ id });
      const { db } = await import("@/core/config/firebase");
      const { doc, updateDoc, serverTimestamp } = await import("firebase/firestore");
      await updateDoc(doc(db, "users", uid, "notifications", id), {
        read: true,
        updatedAt: serverTimestamp(),
      });
    } catch (err: any) {
      logger.warn("notifications.markReadDegraded", { id, message: err?.message || String(err) });
    }
    return ok({ id });
  },

  async markAllRead(): Promise<ApiResult<null>> {
    const headers = await authHeaders();
    try {
      await httpClient.patch("/v1/notifications/read-all", {}, { headers });
      return ok(null);
    } catch {
      // HTTP route absent — fall through to the landed Firestore contract.
    }
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return ok(null);
      const { db } = await import("@/core/config/firebase");
      const { collection, getDocs, writeBatch, serverTimestamp } = await import(
        "firebase/firestore"
      );
      const snap = await getDocs(collection(db, "users", uid, "notifications"));
      const batch = writeBatch(db);
      snap.docs.forEach((d) => {
        if (d.data()?.read !== true) {
          batch.update(d.ref, { read: true, updatedAt: serverTimestamp() });
        }
      });
      await batch.commit();
    } catch (err: any) {
      logger.warn("notifications.markAllReadDegraded", { message: err?.message || String(err) });
    }
    return ok(null);
  },

  async remove(_id: string): Promise<ApiResult<{ id: string }>> {
    await delay(80);
    return ok({ id: _id });
  },

  getPreferences: getNotificationPreferences,
  updatePreferences: updateNotificationPreferences,

  /**
   * Registers a native device token via the server-owned
   * POST /notifications/registerToken endpoint (requireAuth).
   * Direct client writes to `device_tokens/{token}` are denied by
   * firestore.rules (server-owned) — the old setDoc silently failed and
   * push never registered. Failures stay warn-level: registration is
   * retried on next launch via NotificationRepository.
   */
  async registerDeviceToken(token: string): Promise<ApiResult<null>> {
    try {
      const idToken = await getIdToken();
      if (!idToken) {
        logger.warn("notifications.registerDeviceTokenNoAuth");
        return ok(null);
      }
      const base = await resolveApiBase();
      const res = await fetch(`${base}/notifications/registerToken`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ token, platform: getPlatform() }),
      });
      if (!res.ok) {
        throw new Error(`registerToken HTTP ${res.status}`);
      }

      logger.info("notifications.tokenRegistered", { tokenLength: token.length });
      return ok(null);
    } catch (err: any) {
      logger.warn("notifications.registerDeviceTokenError", err);
      return ok(null);
    }
  },

  /**
   * Associates the current device token with an authenticated user ID.
   * Delegates to the server-owned registerToken endpoint (which links both
   * the token doc and the user's `fcmTokens` array via Admin SDK). The old
   * direct device_tokens/users writes are gone: firestore.rules denies all
   * client writes there, so they failed on every login while looking linked.
   */
  async linkUserToDeviceToken(_userId: string): Promise<ApiResult<null>> {
    const token = getCachedDeviceToken();
    if (!token) return ok(null);
    return this.registerDeviceToken(token);
  },

  /**
   * Unlinks the user ID from the device token on logout. Takes the uid
   * explicitly — by logout time the auth session may already be gone.
   *
   * Returns `"failed"` for every non-2xx/exception so authStore can persist
   * the bounded retry entry (contract F3/B2). `tokenOverride` is the
   * retry-only secure copy; normal logout uses the operational cache.
   */
  async unlinkUserFromDeviceToken(
    userId?: string,
    tokenOverride?: string,
  ): Promise<DeviceUnlinkOutcome> {
    const token = tokenOverride ?? getCachedDeviceToken();
    if (!token) return "ok";

    try {
      const idToken = await getIdToken();
      if (!idToken) {
        logger.warn("notifications.unregisterTokenNoAuth");
        return "failed";
      }
      const base = await resolveApiBase();
      const res = await fetch(`${base}/notifications/unregisterToken`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        logger.warn("notifications.unregisterTokenFailed", { status: res.status });
      } else {
        logger.info("notifications.userUnlinkedFromToken");
        return "ok";
      }
    } catch (err: any) {
      logger.warn("notifications.unregisterTokenError", err);
    }

    // Best-effort fallback: drop the token from the user's own fan-out list
    // (owner writes to users/{uid} are rules-allowed). The device_tokens doc
    // itself is server-owned — no direct write is attempted anymore. This
    // partial scrub is NOT a successful unlink, so the caller still keeps a
    // retry entry.
    try {
      if (userId) {
        const { db } = await import("@/core/config/firebase");
        const { doc, updateDoc, arrayRemove, serverTimestamp } = await import("firebase/firestore");
        await updateDoc(doc(db, "users", userId), {
          fcmTokens: arrayRemove(token),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (inner: any) {
      logger.warn("notifications.unlinkFcmTokensError", inner);
    }
    return "failed";
  },
};

// Kept as a named export for the notification index barrel.
export type { NotificationPreferences };
