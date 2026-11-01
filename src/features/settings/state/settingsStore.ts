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
  theme: "system",
  language: "en",
  // Consent flags start OFF — no analytics/ads consent before an
  // affirmative act, and the toggles are device-local only.
  analyticsOptIn: false,
  personalizedAdsOptIn: false,
};

/** Launch's name for the same fresh-install defaults (theme authority). */
export const DEFAULT_SETTINGS: AppSettings = DEFAULTS;

/** Canvas colours used for the native status bar / theme-color meta tag. */
export const THEME_CANVAS_COLORS = {
  light: "#FFFFFF",
  dark: "#000000",
} as const;

export type ResolvedTheme = "light" | "dark";

export const isThemePreference = isTheme;
export const isLanguagePreference = isLanguage;

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
      // Seed the pre-paint appearance so the first render already matches the
      // customer's saved choice (no light-then-dark flash).
      theme: readStoredThemePreference(),
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

/**
 * Reads the persisted appearance without hydrating Zustand, so the pre-paint
 * bootstrap (index.html's inline script and `bootstrapThemeAuthority`) agrees
 * with the store. Reads the split UI key first, then the legacy `burg.settings`
 * blob (read-only migration), tolerating a bare settings object.
 */
export function readStoredThemePreference(
  storage: Pick<Storage, "getItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null,
): ThemePreference {
  if (!storage) return "system";
  for (const key of [UI_SETTINGS_STORAGE_KEY, LEGACY_SETTINGS_STORAGE_KEY]) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") continue;
      const state =
        "state" in parsed && parsed.state && typeof parsed.state === "object"
          ? (parsed as { state: Record<string, unknown> }).state
          : (parsed as Record<string, unknown>);
      if (isTheme(state.theme)) return state.theme;
    } catch {
      // Malformed blob: try the next key, then fall back to system.
    }
  }
  return "system";
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
  options: { systemPrefersDark?: boolean; root?: HTMLElement; doc?: Document } = {},
): ResolvedTheme {
  const resolved = resolveTheme(preference, options.systemPrefersDark ?? readSystemPrefersDark());
  applyThemeToDocument(resolved, options.root);
  syncThemeColorMeta(resolved, options.doc);
  return resolved;
}

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

/**
 * Pre-paint entry point, called from the root route module and again after
 * rehydration. No-ops during SSR.
 */
export function bootstrapThemeAuthority(): void {
  if (typeof document === "undefined") return;
  applyThemePreference(useSettingsStore.getState().theme, {
    systemPrefersDark: readSystemPrefersDark(),
  });
}
