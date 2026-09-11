import { delay, ok, type ApiResult } from "@/core/network/http";
import type { AppNotification } from "@/features/notifications/state/notificationsStore";
import { getPlatform } from "@/shared/platform/platform";
import { getCachedDeviceToken } from "@/shared/platform/pushNotifications";
import { logger } from "@/core/logging/logger";

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

  async markRead(_id: string): Promise<ApiResult<{ id: string }>> {
    await delay(80);
    return ok({ id: _id });
  },

  async markAllRead(): Promise<ApiResult<null>> {
    await delay(120);
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
   * Associates the current device token with an authenticated user ID —
   * both on the token doc and on the user's `fcmTokens` array, which is
   * what the server multicast sender actually reads for order updates.
   */
  async linkUserToDeviceToken(userId: string): Promise<ApiResult<null>> {
    const token = getCachedDeviceToken();
    if (!token) return ok(null);

    try {
      const { db } = await import("@/core/config/firebase");
      const { doc, setDoc, updateDoc, arrayUnion, serverTimestamp } = await import(
        "firebase/firestore"
      );

      await setDoc(
        doc(db, "device_tokens", token),
        {
          userId,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      try {
        await updateDoc(doc(db, "users", userId), {
          fcmTokens: arrayUnion(token),
          updatedAt: serverTimestamp(),
        });
      } catch (userErr: any) {
        // Rules may forbid user-doc writes — token doc link above still holds.
        logger.warn("notifications.linkUserTokensError", userErr);
      }

      logger.info("notifications.userLinkedToToken", { userId });
      return ok(null);
    } catch (err: any) {
      logger.warn("notifications.linkUserError", err);
      return ok(null);
    }
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
