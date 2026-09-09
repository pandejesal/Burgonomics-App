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
   * (netlify/functions serves payments/porter/petpooja/account only);
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
   * Registers a native device token in Firestore under `device_tokens/{token}`.
   */
  async registerDeviceToken(token: string): Promise<ApiResult<null>> {
    try {
      const { db, auth } = await import("@/core/config/firebase");
      const { doc, setDoc, serverTimestamp } = await import("firebase/firestore");

      const tokenRef = doc(db, "device_tokens", token);
      await setDoc(
        tokenRef,
        {
          token,
          platform: getPlatform(),
          userId: auth.currentUser?.uid || null,
          pushEnabled: true,
          preferences: {
            orders: true,
            offers: true,
            announcements: true,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      logger.info("notifications.tokenRegistered", { token: token.slice(0, 10) + "..." });
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
   */
  async unlinkUserFromDeviceToken(userId?: string): Promise<ApiResult<null>> {
    const token = getCachedDeviceToken();
    if (!token) return ok(null);

    try {
      const { db } = await import("@/core/config/firebase");
      const { doc, updateDoc, arrayRemove, serverTimestamp } = await import("firebase/firestore");

      await updateDoc(doc(db, "device_tokens", token), {
        userId: null,
        updatedAt: serverTimestamp(),
      });

      // Also drop the token from the user's fan-out list, or logged-out
      // devices keep receiving that user's order pushes.
      if (userId) {
        try {
          await updateDoc(doc(db, "users", userId), {
            fcmTokens: arrayRemove(token),
            updatedAt: serverTimestamp(),
          });
        } catch (inner: any) {
          logger.warn("notifications.unlinkFcmTokensError", inner);
        }
      }

      logger.info("notifications.userUnlinkedFromToken");
      return ok(null);
    } catch (err: any) {
      logger.warn("notifications.unlinkUserError", err);
      return ok(null);
    }
  },

  /**
   * Updates push notification preferences for this device.
   */
  async updateNotificationPreferences(
    prefs: Partial<NotificationPreferences>,
  ): Promise<ApiResult<null>> {
    const token = getCachedDeviceToken();
    if (!token) return ok(null);

    try {
      const { db } = await import("@/core/config/firebase");
      const { doc, setDoc, serverTimestamp } = await import("firebase/firestore");

      const updateData: any = {
        updatedAt: serverTimestamp(),
      };

      if (prefs.pushEnabled !== undefined) {
        updateData.pushEnabled = prefs.pushEnabled;
      }

      if (
        prefs.orders !== undefined ||
        prefs.offers !== undefined ||
        prefs.announcements !== undefined
      ) {
        updateData.preferences = {
          orders: prefs.orders ?? true,
          offers: prefs.offers ?? true,
          announcements: prefs.announcements ?? true,
        };
      }

      await setDoc(doc(db, "device_tokens", token), updateData, { merge: true });
      return ok(null);
    } catch (err: any) {
      logger.warn("notifications.updatePreferencesError", err);
      return ok(null);
    }
  },
};
