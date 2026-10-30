/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Repository imports the notification/Firebase surface; the theme contract
// test only needs its validation boundary, so keep those side effects out.
vi.mock("@/features/settings/services/settingsService", () => ({
  settingsService: {
    update: vi.fn(async () => ({ success: true, data: {} })),
  },
}));
vi.mock("@/features/notifications/services/notificationsService", () => ({
  notificationsService: { updateNotificationPreferences: vi.fn() },
}));
vi.mock("@/shared/platform/pushNotifications", () => ({
  requestPushPermissions: vi.fn(),
}));

const STORAGE_KEY = "burg.settings";

interface PersistedEnvelope {
  state: Record<string, unknown>;
  version: number;
}

function writePersisted(envelope: PersistedEnvelope): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
}

function validState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    theme: "light",
    language: "en",
    notifications: { offers: true, orderUpdates: true, announcements: false },
    analyticsOptIn: false,
    personalizedAdsOptIn: false,
    ...overrides,
  };
}

/**
 * The store validates storage in its persist merge, so every case needs a
 * fresh module instance to exercise module-evaluation seeding rather than a
 * previous test's in-memory store.
 */
async function loadFreshStore() {
  vi.resetModules();
  return import("./settingsStore");
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  document.documentElement.classList.remove("dark");
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = "";
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((node) => node.remove());
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  document.documentElement.classList.remove("dark");
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = "";
});

describe("settings theme authority", () => {
  it("defaults a fresh install to system appearance", async () => {
    const { useSettingsStore, DEFAULT_SETTINGS } = await loadFreshStore();

    expect(DEFAULT_SETTINGS.theme).toBe("system");
    expect(useSettingsStore.getState().theme).toBe("system");
  });

  it("preserves an explicit dark choice from a v2 payload", async () => {
    writePersisted({
      version: 2,
      state: validState({
        theme: "dark",
        language: "hi",
        notifications: { offers: false, orderUpdates: true, announcements: true },
        analyticsOptIn: true,
        personalizedAdsOptIn: true,
      }),
    });

    const { useSettingsStore } = await loadFreshStore();

    // Seeded before React paints, then rehydrated with the same value.
    expect(useSettingsStore.getState().theme).toBe("dark");
    await useSettingsStore.persist.rehydrate();

    const state = useSettingsStore.getState();
    expect(state.theme).toBe("dark");
    expect(state.language).toBe("hi");
    expect(state.notifications).toEqual({
      offers: false,
      orderUpdates: true,
      announcements: true,
    });
    expect(state.analyticsOptIn).toBe(true);
    expect(state.personalizedAdsOptIn).toBe(true);
  });

  it("preserves an explicit light choice from a v2 payload", async () => {
    writePersisted({ version: 2, state: validState({ theme: "light" }) });

    const { useSettingsStore } = await loadFreshStore();
    await useSettingsStore.persist.rehydrate();

    expect(useSettingsStore.getState().theme).toBe("light");
  });

  it("falls back to system when the stored theme is not in the enum", async () => {
    writePersisted({ version: 3, state: validState({ theme: "neon" }) });

    const { useSettingsStore } = await loadFreshStore();
    await useSettingsStore.persist.rehydrate();

    expect(useSettingsStore.getState().theme).toBe("system");
  });

  it("falls back to system when stored JSON is malformed", async () => {
    localStorage.setItem(STORAGE_KEY, "{not-json");

    const { useSettingsStore } = await loadFreshStore();
    await useSettingsStore.persist.rehydrate();

    expect(useSettingsStore.getState().theme).toBe("system");
  });

  it("falls back to system when localStorage access is blocked", async () => {
    const storageGetter = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    try {
      const { useSettingsStore } = await loadFreshStore();
      expect(useSettingsStore.getState().theme).toBe("system");
    } finally {
      storageGetter.mockRestore();
    }
  });

  it("keeps the session preference when storage methods throw after access succeeds", async () => {
    const { useSettingsStore } = await loadFreshStore();
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });

    expect(() => useSettingsStore.getState().update({ theme: "dark" })).not.toThrow();
    expect(useSettingsStore.getState().theme).toBe("dark");
    await useSettingsStore.persist.rehydrate();
    expect(useSettingsStore.getState().theme).toBe("dark");
    write.mockRestore();
  });

  it("resolves system against the OS and tracks change events with cleanup", async () => {
    const { resolveTheme, watchSystemTheme } = await loadFreshStore();

    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");

    const listeners = new Set<(event: { matches: boolean }) => void>();
    const mediaQuery = {
      matches: false,
      addEventListener: vi.fn(
        (_type: "change", listener: (event: { matches: boolean }) => void) => {
          listeners.add(listener);
        },
      ),
      removeEventListener: vi.fn(
        (_type: "change", listener: (event: { matches: boolean }) => void) => {
          listeners.delete(listener);
        },
      ),
    };
    const onChange = vi.fn();

    const stop = watchSystemTheme("system", onChange, mediaQuery);
    listeners.forEach((listener) => listener({ matches: true }));
    expect(onChange).toHaveBeenCalledWith(true);

    stop();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);

    const explicitStop = watchSystemTheme("dark", onChange, mediaQuery);
    expect(mediaQuery.addEventListener).toHaveBeenCalledTimes(1);
    explicitStop();
  });

  it("applies the resolved class, color-scheme and theme-color meta", async () => {
    const { applyThemePreference, THEME_CANVAS_COLORS } = await loadFreshStore();
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);

    applyThemePreference("dark", { systemPrefersDark: false });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(meta.content).toBe(THEME_CANVAS_COLORS.dark);

    applyThemePreference("light", { systemPrefersDark: true });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(meta.content).toBe(THEME_CANVAS_COLORS.light);
  });

  it("persists an explicit change and refuses an invalid runtime enum", async () => {
    const { useSettingsStore, isThemePreference } = await loadFreshStore();

    useSettingsStore.getState().update({ theme: "dark" });
    expect(useSettingsStore.getState().theme).toBe("dark");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").state.theme).toBe("dark");

    useSettingsStore.getState().update({ theme: "neon" as never });
    expect(useSettingsStore.getState().theme).toBe("dark");
    expect(isThemePreference("neon")).toBe(false);
  });

  it("resets to system without reviving an explicit choice", async () => {
    const { useSettingsStore } = await loadFreshStore();

    useSettingsStore.getState().update({ theme: "dark" });
    useSettingsStore.getState().reset();

    expect(useSettingsStore.getState().theme).toBe("system");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").state.theme).toBe("system");
  });

  it("rejects an invalid theme at the repository boundary", async () => {
    const { useSettingsStore } = await loadFreshStore();
    const { settingsRepository } = await import("../repositories/SettingsRepository");

    const result = await settingsRepository.update({ theme: "neon" as never });

    expect(result.success).toBe(false);
    expect(useSettingsStore.getState().theme).toBe("system");
  });
});
