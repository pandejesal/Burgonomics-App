/**
 * NotificationsService — mock implementation of the future
 *   GET    /v1/notifications
 *   PATCH  /v1/notifications/:id/read
 *   PATCH  /v1/notifications/read-all
 *   DELETE /v1/notifications/:id
 * endpoints and device-token registration for push (Firebase later).
 */
import { delay, ok, type ApiResult } from "@/core/network/http";
import type { AppNotification } from "@/features/notifications/state/notificationsStore";

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
  async registerDeviceToken(_token: string): Promise<ApiResult<null>> {
    await delay(100);
    return ok(null);
  },
};
