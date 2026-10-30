import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type {
  AppSettings,
  LanguagePreference,
  NotificationPreferences,
  ThemePreference,
} from "@/features/settings/models";

/**
 * Single source of truth for the persisted appearance preference.
 *
 * The same helpers are used by:
 *  - the pre-paint bootstrap (`bootstrapThemeAuthority`, called from __root),
 *  - the root layout effect (system-change + resume listener),
 *  - the Settings screen (explicit System / Light / Dark control).
 *
 * Keeping class application, validation and storage migration here means the
 * app never has two competing theme implementations.
 */

export const SETTINGS_STORAGE_KEY = "burg.settings";

export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
const LANGUAGES = ["en", "hi"] as const;

/** Canvas colours used for the native status bar / theme-color meta tag. */
export const THEME_CANVAS_COLORS = {
  light: "#FFFFFF",
  dark: "#000000",
} as const;

export type ResolvedTheme = "light" | "dark";

export const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  offers: true,
  orderUpdates: true,
  announcements: false,
};

/**
 * Fresh installs follow the OS appearance. Existing explicit choices are
 * preserved by the persist migration/merge below — they are never rewritten
 * just because the default changed from "light" to "system".
 */
export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  language: "en",
  notifications: DEFAULT_NOTIFICATIONS,
  // Consent flags start OFF — no analytics/ads consent before an
  // affirmative act, and the toggles are device-local only.
  analyticsOptIn: false,
  personalizedAdsOptIn: false,
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (THEME_PREFERENCES as readonly string[]).includes(value);
}

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function coerceNotifications(value: unknown): NotificationPreferences {
  const source = isRecord(value) ? value : {};
  return {
    offers: coerceBoolean(source.offers, DEFAULT_NOTIFICATIONS.offers),
    orderUpdates: coerceBoolean(source.orderUpdates, DEFAULT_NOTIFICATIONS.orderUpdates),
    announcements: coerceBoolean(source.announcements, DEFAULT_NOTIFICATIONS.announcements),
  };
}

/**
 * Runtime validation for anything read from storage. Invalid themes fall back
 * to "system" — never to the previously rendered theme, so a hand-edited or
 * corrupted value cannot pin the app to an unavailable appearance.
 */
export function normalizeSettings(value: unknown): AppSettings {
  const source = isRecord(value) ? value : {};
  return {
    theme: isThemePreference(source.theme) ? source.theme : "system",
    language: isLanguagePreference(source.language) ? source.language : "en",
    notifications: coerceNotifications(source.notifications),
    analyticsOptIn: coerceBoolean(source.analyticsOptIn, DEFAULT_SETTINGS.analyticsOptIn),
    personalizedAdsOptIn: coerceBoolean(
      source.personalizedAdsOptIn,
      DEFAULT_SETTINGS.personalizedAdsOptIn,
    ),
  };
}

function safeLocalStorage(): Pick<Storage, "getItem"> | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    // Safari private mode / blocked storage throws on access.
  }
  return null;
}

/**
 * Reads the persisted preference without hydrating Zustand. Used to seed the
 * store and apply the correct class before React's first paint.
 */
export function readStoredThemePreference(
  storage: Pick<Storage, "getItem"> | null = safeLocalStorage(),
): ThemePreference {
  if (!storage) return "system";
  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return "system";

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return "system";

    // Zustand stores `{ state, version }`; tolerate a bare settings object
    // so older local snapshots cannot wedge the app on a light default.
    const state = isRecord(parsed.state) ? parsed.state : parsed;
    return isThemePreference(state.theme) ? state.theme : "system";
  } catch {
    return "system";
  }
}

function memoryStorage(): StateStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

function settingsStorage(): StateStorage {
  const fallback = memoryStorage();
  let storage: Storage | null = null;
  try {
    if (typeof window !== "undefined") storage = window.localStorage;
  } catch {
    // A blocked storage getter is equivalent to unavailable storage.
  }
  return {
    getItem: (key) => {
      try {
        if (storage) {
          const value = storage.getItem(key);
          if (value !== null) fallback.setItem(key, value);
          return value;
        }
      } catch {
        storage = null;
      }
      return fallback.getItem(key);
    },
    setItem: (key, value) => {
      fallback.setItem(key, value);
      try {
        storage?.setItem(key, value);
      } catch {
        // Quota/private-mode errors can happen even when the getter succeeds.
        // Keep this session's choice, including any later rehydration.
        storage = null;
      }
    },
    removeItem: (key) => {
      fallback.removeItem(key);
      try {
        storage?.removeItem(key);
      } catch {
        storage = null;
      }
    },
  };
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

export interface SystemThemeQuery {
  readonly matches: boolean;
  addEventListener?: (type: "change", listener: (event: { matches: boolean }) => void) => void;
  removeEventListener?: (type: "change", listener: (event: { matches: boolean }) => void) => void;
}

export function readSystemPrefersDark(win: Window | null = null): boolean {
  try {
    const target = win ?? (typeof window !== "undefined" ? window : null);
    if (!target || typeof target.matchMedia !== "function") return false;
    return target.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/**
 * Applies the resolved appearance to the document. `data-theme` and
 * `color-scheme` are set alongside the Tailwind `.dark` class so native
 * controls, scrollbars and the pre-CSS canvas follow the same decision.
 */
export function applyThemeToDocument(resolved: ResolvedTheme, root?: HTMLElement): void {
  const element = root ?? (typeof document !== "undefined" ? document.documentElement : null);
  if (!element) return;

  element.classList.toggle("dark", resolved === "dark");
  element.dataset.theme = resolved;
  element.style.colorScheme = resolved;

  // Native shells (status bar / splash) listen for this instead of importing
  // the store, keeping one appearance authority with no native coupling here.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("burg:themechange", { detail: { resolved } }));
  }
}

function syncThemeColorMeta(resolved: ResolvedTheme, doc?: Document): void {
  const target = doc ?? (typeof document !== "undefined" ? document : null);
  if (!target) return;
  const meta = target.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = THEME_CANVAS_COLORS[resolved];
}

export function applyThemePreference(
  preference: ThemePreference,
  options: {
    systemPrefersDark?: boolean;
    root?: HTMLElement;
    doc?: Document;
  } = {},
): ResolvedTheme {
  const resolved = resolveTheme(preference, options.systemPrefersDark ?? readSystemPrefersDark());
  applyThemeToDocument(resolved, options.root);
  syncThemeColorMeta(resolved, options.doc);
  return resolved;
}

/**
 * Subscribes to OS appearance changes only while the user chose "system".
 * Returns a no-op cleanup for explicit Light/Dark so the root effect can use
 * one code path and still guarantee listener removal.
 */
export function watchSystemTheme(
  preference: ThemePreference,
  onChange: (prefersDark: boolean) => void,
  mediaQuery: SystemThemeQuery | null,
): () => void {
  if (preference !== "system" || !mediaQuery?.addEventListener) return () => undefined;
  const listener = (event: { matches: boolean }) => onChange(event.matches);
  mediaQuery.addEventListener("change", listener);
  return () => mediaQuery.removeEventListener?.("change", listener);
}

interface SettingsState extends AppSettings {
  update: (patch: Partial<AppSettings>) => void;
  updateNotifications: (patch: Partial<AppSettings["notifications"]>) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      notifications: { ...DEFAULT_NOTIFICATIONS },
      // Seed from storage so the first render (and the module-level pre-paint
      // bootstrap) already has the explicit choice, eliminating the
      // light-then-dark flash caused by skipHydration.
      theme: readStoredThemePreference(),
      update: (patch) =>
        set((s) => ({
          ...s,
          ...patch,
          // Runtime guard: a stale caller or a hand-edited object cannot
          // write an unsupported enum value back into the store.
          theme: isThemePreference(patch.theme) ? patch.theme : s.theme,
          language: isLanguagePreference(patch.language) ? patch.language : s.language,
          notifications:
            patch.notifications === undefined
              ? s.notifications
              : coerceNotifications({ ...s.notifications, ...patch.notifications }),
        })),
      updateNotifications: (patch) =>
        set((s) => ({
          notifications: coerceNotifications({ ...s.notifications, ...patch }),
        })),
      reset: () =>
        set({
          ...DEFAULT_SETTINGS,
          notifications: { ...DEFAULT_NOTIFICATIONS },
        }),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      version: 3,
      storage: createJSONStorage(settingsStorage),
      skipHydration: true,
      migrate: (persistedState) => normalizeSettings(persistedState),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizeSettings(persistedState),
      }),
      partialize: (s) => ({
        theme: s.theme,
        language: s.language,
        notifications: s.notifications,
        analyticsOptIn: s.analyticsOptIn,
        personalizedAdsOptIn: s.personalizedAdsOptIn,
      }),
    },
  ),
);

/**
 * Pre-paint entry point. Called once from the root route module (which is
 * evaluated before React mounts) and again by the root effect after
 * rehydration. Safe during SSR — it no-ops without a document.
 */
export function bootstrapThemeAuthority(): void {
  if (typeof document === "undefined") return;
  applyThemePreference(useSettingsStore.getState().theme, {
    systemPrefersDark: readSystemPrefersDark(),
  });
}
