import { delay, ok, type ApiResult } from "@/core/network/http";
import { httpClient } from "@/core/network/httpClient";
import { auth } from "@/core/config/firebase";
import type { AppNotification } from "@/features/notifications/state/notificationsStore";
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

export interface NotificationPreferences {
  pushEnabled: boolean;
  orders: boolean;
  offers: boolean;
  announcements: boolean;
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
      const { appConfig } = await import("@/core/config/env");
      const { auth } = await import("@/core/config/firebase");
      const idToken = await auth.currentUser?.getIdToken().catch(() => null);
      if (!idToken) {
        logger.warn("notifications.registerDeviceTokenNoAuth");
        return ok(null);
      }
      const paymentsBase = (
        appConfig.integrations.paymentsApiBaseUrl ||
        "https://asia-south1-burgonomics-7faa8.cloudfunctions.net/api/payments"
      ).replace(/\/$/, "");
      const apiBase = paymentsBase.endsWith("/payments")
        ? paymentsBase.slice(0, -"/payments".length)
        : paymentsBase;
      const res = await fetch(`${apiBase}/notifications/registerToken`, {
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
   * Loop 37/120: detaches via the server-owned POST
   * /notifications/unregisterToken endpoint (requireAuth — callers must
   * invoke pre-signout while authed). The old direct device_tokens write
   * ALWAYS failed (rules deny all client writes there), so logged-out
   * devices kept their token identity. Failures stay warn-level: logout
   * must never fail on push cleanup.
   */
  async unlinkUserFromDeviceToken(userId?: string): Promise<ApiResult<null>> {
    const token = getCachedDeviceToken();
    if (!token) return ok(null);

    try {
      const { appConfig } = await import("@/core/config/env");
      const { auth } = await import("@/core/config/firebase");
      const idToken = await auth.currentUser?.getIdToken().catch(() => null);
      if (idToken) {
        const paymentsBase = (
          appConfig.integrations.paymentsApiBaseUrl ||
          "https://asia-south1-burgonomics-7faa8.cloudfunctions.net/api/payments"
        ).replace(/\/$/, "");
        const apiBase = paymentsBase.endsWith("/payments")
          ? paymentsBase.slice(0, -"/payments".length)
          : paymentsBase;
        const res = await fetch(`${apiBase}/notifications/unregisterToken`, {
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
          return ok(null);
        }
      }
    } catch (err: any) {
      logger.warn("notifications.unregisterTokenError", err);
    }

    // Best-effort fallback: drop the token from the user's own fan-out list
    // (owner writes to users/{uid} are rules-allowed). The device_tokens doc
    // itself is server-owned — no direct write is attempted anymore.
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
    return ok(null);
  },

  /**
   * Updates push notification preferences for this device.
   *
   * Loop 38/120: local-only by design. The old code setDoc'd device_tokens,
   * which rules ALWAYS deny (server-owned) — every call failed into a warn
   * log while the toggle appeared synced. Nothing server-side reads these
   * preferences (dispatch is topic/token addressed), so no endpoint is
   * needed: the local settings store is the source of truth.
   */
  async updateNotificationPreferences(
    _prefs: Partial<NotificationPreferences>,
  ): Promise<ApiResult<null>> {
    return ok(null);
  },
};
