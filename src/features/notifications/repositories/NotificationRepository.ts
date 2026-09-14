/**
 * NotificationRepository — UI-facing surface for the notification
 * center. State lives in `useNotificationsStore`; persistence resolves
 * through `notificationsService` with a runtime guard:
 *
 * Landed contract in this tree (MOP-S2):
 *   markRead()/markAllRead() → PATCH /v1/notifications/:id/read (brief
 *     contract) FIRST; when that route is absent at runtime the service
 *     degrades to a direct Firestore `users/{uid}/notifications` write
 *     (firestore.rules:90-93), and when Firestore is unreachable it still
 *     resolves ok so the local badge clears (queued/degraded path).
 *   list()/remove()/registerDeviceToken() → unchanged stubs/Firestore
 *     paths owned by their own batches.
 *
 * Native/Web app-badge clearing is best-effort and guarded — a missing
 * Badging API degrades silently, never throws into the read path.
 */
import type { ApiResult } from "@/core/network/http";
import { ok } from "@/core/network/http";
import { notificationsService } from "@/features/notifications/services/notificationsService";
import {
  useNotificationsStore,
  type AppNotification,
} from "@/features/notifications/state/notificationsStore";

export class NotificationRepository {
  readonly name = "NotificationRepository";

  list(): AppNotification[] {
    return useNotificationsStore.getState().items;
  }

  unreadCount(): number {
    return useNotificationsStore.getState().unreadCount;
  }

  async refresh(): Promise<ApiResult<AppNotification[]>> {
    const res = await notificationsService.list();
    if (res.success) useNotificationsStore.getState().hydrate(res.data);
    return res;
  }

  async markRead(id: string): Promise<ApiResult<void>> {
    const res = await notificationsService.markRead(id);
    if (!res.success) return res;
    useNotificationsStore.getState().markRead(id);
    clearAppBadgeIfEmpty();
    return ok(undefined);
  }

  async markAllRead(): Promise<ApiResult<void>> {
    const res = await notificationsService.markAllRead();
    if (!res.success) return res;
    useNotificationsStore.getState().markAllRead();
    clearAppBadgeIfEmpty();
    return ok(undefined);
  }

  async remove(id: string): Promise<ApiResult<void>> {
    const res = await notificationsService.remove(id);
    if (!res.success) return res;
    useNotificationsStore.getState().remove(id);
    return ok(undefined);
  }

  push(n: AppNotification) {
    useNotificationsStore.getState().push(n);
  }

  registerDeviceToken(token: string) {
    return notificationsService.registerDeviceToken(token);
  }

  clear() {
    useNotificationsStore.getState().clear();
  }
}

/**
 * Best-effort app-badge clear once the tray is empty. The Badging API
 * exists only on some browsers — absence degrades silently.
 */
function clearAppBadgeIfEmpty() {
  try {
    if (useNotificationsStore.getState().unreadCount !== 0) return;
    const nav = typeof navigator !== "undefined" ? (navigator as any) : null;
    if (nav && typeof nav.clearAppBadge === "function") {
      void nav.clearAppBadge().catch(() => {});
    }
  } catch {
    // Badge clearing must never break the read path.
  }
}

export const notificationRepository = new NotificationRepository();
