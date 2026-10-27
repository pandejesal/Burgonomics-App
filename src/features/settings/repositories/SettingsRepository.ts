/**
 * SettingsRepository — UI-facing surface for the app preferences screen.
 *
 * Theme/language/consent are install-global and stay in `settingsStore`.
 * Notification preferences are per-account/device (contract C-01): they live
 * in `useNotificationPrefsStore` keyed by uid and sync through the real
 * preferences API, so this repository never reports a local write as a
 * server success.
 */
import { fail, ok, type ApiResult } from "@/core/network/http";
import { settingsService } from "@/features/settings/services/settingsService";
import { useSettingsStore } from "@/features/settings/state/settingsStore";
import {
  useNotificationPrefsStore,
} from "@/features/settings/state/notificationPrefsStore";
import type {
  AppSettings,
  NotificationPreferences,
} from "@/features/settings/models";
import { currentScopedUid } from "@/features/auth/utils/scopedPersistence";
import { requestPushPermissions } from "@/shared/platform/pushNotifications";

function notificationFailureMessage(code: string): string {
  switch (code) {
    case "unauthenticated":
      return "Sign in again to save notification preferences.";
    case "forbidden":
      return "This account can't change notification preferences.";
    case "offline":
      return "Saved on this device. We'll sync when you're back online.";
    case "conflict":
      return "Another device changed these preferences. Review the conflict.";
    case "not_found":
      return "Notification settings aren't available on this app build. Your choices are stored on this device.";
    case "bad_request":
      return "We couldn't save these settings. Please update the app or try again.";
    case "invalid_response":
      return "The server returned an unexpected response. Your choices are stored on this device.";
    default:
      return "Couldn't save notification preferences yet. We'll retry.";
  }
}

export class SettingsRepository {
  readonly name = "SettingsRepository";

  get(): AppSettings {
    const s = useSettingsStore.getState();
    return {
      theme: s.theme,
      language: s.language,
      analyticsOptIn: s.analyticsOptIn,
      personalizedAdsOptIn: s.personalizedAdsOptIn,
    };
  }

  getNotificationPreferences(): NotificationPreferences {
    return useNotificationPrefsStore.getState().desired;
  }

  async update(patch: Partial<AppSettings>): Promise<ApiResult<void>> {
    useSettingsStore.getState().update(patch);
    const res = await settingsService.update(patch);
    if (!res.success) return res;
    return ok(undefined);
  }

  async updateNotifications(
    patch: Partial<NotificationPreferences>,
  ): Promise<ApiResult<void>> {
    const uid = currentScopedUid();
    if (!uid) {
      return fail("unauthenticated", notificationFailureMessage("unauthenticated"));
    }

    const store = useNotificationPrefsStore.getState();
    if (store.uid !== uid) {
      await store.hydrateForUid(uid);
    }

    const before = useNotificationPrefsStore.getState().desired;
    // A permission prompt is only allowed on an explicit OFF→ON toggle
    // (contract C-03), never while booting or while turning something off.
    const turnedOn = (Object.keys(patch) as Array<keyof NotificationPreferences>).some(
      (key) => patch[key] === true && before[key] === false,
    );

    const entries = Object.entries(patch) as Array<
      [keyof NotificationPreferences, boolean | undefined]
    >;
    if (turnedOn) {
      // Must run inside the toggle's user gesture — awaiting the save first
      // can lose the browser's transient activation and suppress the prompt.
      void requestPushPermissions();
    }
    for (const [key, value] of entries) {
      if (typeof value === "boolean") {
        await useNotificationPrefsStore.getState().setPreference(key, value);
      }
    }

    const state = useNotificationPrefsStore.getState();
    if (state.status === "synced") return ok(undefined);
    if (state.status === "pending") {
      return fail("not_synced", notificationFailureMessage(state.errorCode ?? "offline"), true);
    }
    if (state.status === "conflict") {
      return fail("conflict", notificationFailureMessage("conflict"));
    }
    if (state.status === "error") {
      const code = state.errorCode ?? "server";
      return fail(code, notificationFailureMessage(code));
    }
    return ok(undefined);
  }
}

export const settingsRepository = new SettingsRepository();
