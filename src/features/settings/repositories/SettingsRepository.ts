/**
 * SettingsRepository — UI-facing surface for the app preferences
 * screen. Persistence is local today; a future backend can sync
 * settings across devices by wiring `update()` to PATCH /v1/settings.
 */
import type { ApiResult } from "@/core/network/http";
import { ok } from "@/core/network/http";
import { settingsService } from "@/features/settings/services/settingsService";
import { useSettingsStore } from "@/features/settings/state/settingsStore";
import type { AppSettings } from "@/features/settings/models";

export class SettingsRepository {
  readonly name = "SettingsRepository";

  get(): AppSettings {
    const s = useSettingsStore.getState();
    return {
      theme: s.theme,
      language: s.language,
      notifications: s.notifications,
      analyticsOptIn: s.analyticsOptIn,
      personalizedAdsOptIn: s.personalizedAdsOptIn,
    };
  }

  async update(patch: Partial<AppSettings>): Promise<ApiResult<void>> {
    useSettingsStore.getState().update(patch);
    const res = await settingsService.update(patch);
    if (!res.success) return res;
    return ok(undefined);
  }

  async updateNotifications(
    patch: Partial<AppSettings["notifications"]>,
  ): Promise<ApiResult<void>> {
    useSettingsStore.getState().updateNotifications(patch);
    const res = await settingsService.update({
      notifications: { ...useSettingsStore.getState().notifications, ...patch },
    });
    if (!res.success) return res;
    return ok(undefined);
  }
}

export const settingsRepository = new SettingsRepository();
