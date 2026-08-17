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
   * Associates the current device token with an authenticated user ID.
   */
  async linkUserToDeviceToken(userId: string): Promise<ApiResult<null>> {
    const token = getCachedDeviceToken();
    if (!token) return ok(null);

    try {
      const { db } = await import("@/core/config/firebase");
      const { doc, setDoc, serverTimestamp } = await import("firebase/firestore");

      await setDoc(
        doc(db, "device_tokens", token),
        {
          userId,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      logger.info("notifications.userLinkedToToken", { userId });
      return ok(null);
    } catch (err: any) {
      logger.warn("notifications.linkUserError", err);
      return ok(null);
    }
  },

  /**
   * Unlinks the user ID from the device token on logout.
   */
  async unlinkUserFromDeviceToken(): Promise<ApiResult<null>> {
    const token = getCachedDeviceToken();
    if (!token) return ok(null);

    try {
      const { db } = await import("@/core/config/firebase");
      const { doc, updateDoc, serverTimestamp } = await import("firebase/firestore");

      await updateDoc(doc(db, "device_tokens", token), {
        userId: null,
        updatedAt: serverTimestamp(),
      });

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
