/**
 * NotificationRepository — UI-facing surface for the notification
 * center. Mirrors the future backend contract while keeping all state
 * inside `useNotificationsStore`.
 *
 * Future integration points:
 *   list()               → GET  /v1/notifications
 *   markRead()           → PATCH /v1/notifications/:id/read
 *   markAllRead()        → PATCH /v1/notifications/read-all
 *   remove()             → DELETE /v1/notifications/:id
 *   registerDeviceToken()→ POST /v1/devices  (Firebase / APNs token)
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
    return ok(undefined);
  }

  async markAllRead(): Promise<ApiResult<void>> {
    const res = await notificationsService.markAllRead();
    if (!res.success) return res;
    useNotificationsStore.getState().markAllRead();
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

export const notificationRepository = new NotificationRepository();
