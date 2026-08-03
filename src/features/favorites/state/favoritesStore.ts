import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Favorite } from "@/features/favorites/models";

interface FavoritesState {
  items: Favorite[];
  add: (f: Favorite) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set) => ({
      items: [],
      add: (f) => set((s) => ({ items: [f, ...s.items] })),
      remove: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
      clear: () => set({ items: [] }),
    }),
    {
      name: "burg.favorites",
      version: 1,
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
      partialize: (s) => ({ items: s.items }),
    },
  ),
);
