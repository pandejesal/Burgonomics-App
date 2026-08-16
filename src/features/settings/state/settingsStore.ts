import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AppSettings } from "@/features/settings/models";

interface SettingsState extends AppSettings {
  update: (patch: Partial<AppSettings>) => void;
  updateNotifications: (patch: Partial<AppSettings["notifications"]>) => void;
  reset: () => void;
}

const DEFAULTS: AppSettings = {
  theme: "light",
  language: "en",
  notifications: {
    offers: true,
    orderUpdates: true,
    announcements: false,
  },
  analyticsOptIn: true,
  personalizedAdsOptIn: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      update: (patch) => set((s) => ({ ...s, ...patch })),
      updateNotifications: (patch) =>
        set((s) => ({
          notifications: { ...s.notifications, ...patch },
        })),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: "burg.settings",
      version: 2,
      storage: createJSONStorage(() => {
        if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
        const memoryStorage = new Map<string, string>();
        return {
          getItem: (key: string) => memoryStorage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            memoryStorage.set(key, value);
          },
          removeItem: (key: string) => {
            memoryStorage.delete(key);
          },
          clear: () => {
            memoryStorage.clear();
          },
          length: memoryStorage.size,
          key: (index: number) => Array.from(memoryStorage.keys())[index] ?? null,
        } as Storage;
      }),
      skipHydration: true,
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
