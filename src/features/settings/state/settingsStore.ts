import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AppSettings, LanguagePreference, ThemePreference } from "@/features/settings/models";

/**
 * Install-global UI preferences only. Notification preferences were moved
 * out of this store into the per-account/device `notificationPrefsStore`
 * (`burg.notifPrefs.v1.<uid>`) — writing them here would let one account's
 * consent leak to the next person who signs in on a shared device.
 *
 * Storage migration: the legacy key `burg.settings` (which also held the
 * pre-account notification blob) is READ ONLY. UI prefs now live in
 * `burg.settings.ui.v1`, so existing customers keep their theme/language
 * while the legacy notification blob is never overwritten or deleted.
 */
export const LEGACY_SETTINGS_STORAGE_KEY = "burg.settings";
export const UI_SETTINGS_STORAGE_KEY = "burg.settings.ui.v1";

interface SettingsState extends AppSettings {
  update: (patch: Partial<AppSettings>) => void;
  reset: () => void;
}

const DEFAULTS: AppSettings = {
  theme: "light",
  language: "en",
  // Consent flags start OFF — no analytics/ads consent before an
  // affirmative act, and the toggles are device-local only.
  analyticsOptIn: false,
  personalizedAdsOptIn: false,
};

const memoryFallback = new Map<string, string>();

function isTheme(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function isLanguage(value: unknown): value is LanguagePreference {
  return value === "en" || value === "hi";
}

/**
 * Builds a zustand-compatible payload from the legacy `burg.settings` blob.
 * Reads only theme/language/consent flags; the `notifications` key is left
 * untouched in legacy storage for the per-uid migration prompt to inspect.
 */
function migrateLegacyUiPayload(): string | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const container =
      parsed && typeof parsed === "object" && "state" in parsed
        ? (parsed as { state?: unknown }).state
        : parsed;
    if (!container || typeof container !== "object") return null;
    const state = container as Record<string, unknown>;
    return JSON.stringify({
      state: {
        theme: isTheme(state.theme) ? state.theme : DEFAULTS.theme,
        language: isLanguage(state.language) ? state.language : DEFAULTS.language,
        analyticsOptIn: state.analyticsOptIn === true,
        personalizedAdsOptIn: state.personalizedAdsOptIn === true,
      },
      version: 1,
    });
  } catch {
    return null;
  }
}

/** localStorage when available, memory otherwise; legacy read-only fallback. */
function uiSettingsStorage(): Storage {
  if (typeof window === "undefined" || !window.localStorage) {
    return {
      getItem: (key: string) => memoryFallback.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memoryFallback.set(key, value);
      },
      removeItem: (key: string) => {
        memoryFallback.delete(key);
      },
      clear: () => {
        memoryFallback.clear();
      },
      length: memoryFallback.size,
      key: (index: number) => Array.from(memoryFallback.keys())[index] ?? null,
    } as Storage;
  }
  return {
    getItem: (key: string) =>
      window.localStorage.getItem(key) ?? migrateLegacyUiPayload(),
    setItem: (key: string, value: string) => {
      window.localStorage.setItem(key, value);
    },
    removeItem: (key: string) => {
      window.localStorage.removeItem(key);
    },
    clear: () => window.localStorage.clear(),
    get length() {
      return window.localStorage.length;
    },
    key: (index: number) => window.localStorage.key(index),
  };
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      update: (patch) => set((s) => ({ ...s, ...patch })),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: UI_SETTINGS_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(uiSettingsStorage),
      skipHydration: true,
      partialize: (s) => ({
        theme: s.theme,
        language: s.language,
        analyticsOptIn: s.analyticsOptIn,
        personalizedAdsOptIn: s.personalizedAdsOptIn,
      }),
    },
  ),
);
