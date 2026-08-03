/**
 * SettingsService — mock implementation of the future
 *   GET   /v1/settings
 *   PATCH /v1/settings
 * endpoints. State is held client-side today; a real backend can sync
 * these preferences across devices without any UI changes.
 */
import { delay, ok, type ApiResult } from "@/core/network/http";
import type { AppSettings } from "@/features/settings/models";

export const settingsService = {
  async update(patch: Partial<AppSettings>): Promise<ApiResult<Partial<AppSettings>>> {
    await delay(80);
    return ok(patch);
  },
};
