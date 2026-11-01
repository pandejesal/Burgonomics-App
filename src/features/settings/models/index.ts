export type ThemePreference = "system" | "light" | "dark";
export type LanguagePreference = "en" | "hi";

/**
 * The four customer notification categories from the device-controls
 * contract (F5/§9). Keys are stable — they are persisted per account/device
 * and sent to the preferences API as-is.
 */
export type NotificationPreferenceKey =
  | "offers"
  | "orderUpdates"
  | "announcements"
  | "supportReplies";

export interface NotificationPreferences {
  offers: boolean;
  orderUpdates: boolean;
  announcements: boolean;
  supportReplies: boolean;
}

/**
 * Contract §9 defaults. An absent stored record uses these values:
 * offers/orderUpdates/supportReplies are on, announcements are opt-in.
 * An explicit `false` is always preserved — never re-defaulted.
 */
export const NOTIFICATION_PREFERENCE_DEFAULTS: Readonly<NotificationPreferences> =
  Object.freeze({
    offers: true,
    orderUpdates: true,
    announcements: false,
    supportReplies: true,
  });

/**
 * Per-uid decision for the pre-account `burg.settings.notifications` blob.
 * `pending` shows the one-time migration prompt; the safe/keep-separate
 * outcome is `declined` (the legacy blob is never applied automatically).
 */
export type LegacyNotificationDecision = "pending" | "claimed" | "declined";

export type NotificationSyncStatus = "idle" | "pending" | "synced" | "conflict" | "error";

export type NotificationSyncErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "offline"
  | "server"
  | "not_found"
  | "bad_request"
  | "invalid_response";

/** Install-global UI preferences. Notification prefs deliberately live in
 * `notificationPrefsStore` keyed by uid, not here. */
export interface AppSettings {
  theme: ThemePreference;
  language: LanguagePreference;
  analyticsOptIn: boolean;
  personalizedAdsOptIn: boolean;
}

export const NOTIFICATION_PREFERENCE_KEYS: readonly NotificationPreferenceKey[] = [
  "offers",
  "orderUpdates",
  "announcements",
  "supportReplies",
] as const;
