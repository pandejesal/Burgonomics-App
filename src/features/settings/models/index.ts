export type ThemePreference = "system" | "light" | "dark";
export type LanguagePreference = "en" | "hi";

export interface NotificationPreferences {
  offers: boolean;
  orderUpdates: boolean;
  announcements: boolean;
}

export interface AppSettings {
  theme: ThemePreference;
  language: LanguagePreference;
  notifications: NotificationPreferences;
  analyticsOptIn: boolean;
  personalizedAdsOptIn: boolean;
}
