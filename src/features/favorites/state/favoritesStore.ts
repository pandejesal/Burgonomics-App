import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Favorite } from "@/features/favorites/models";
import {
  scopedNamespacedStorage,
  browserOrMemoryStorage,
  onAuthUidChange,
  readScopedPersisted,
} from "@/features/auth/utils/scopedPersistence";

// Never hydrate the old global key: its owner cannot be established.
const STORAGE_KEY = "burg.favorites.local";

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
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => scopedNamespacedStorage(browserOrMemoryStorage())),
      skipHydration: true,
      partialize: (s) => ({ items: s.items }),
    },
  ),
);

onAuthUidChange((uid) => {
  // Read the incoming account before setState's synchronous persist write.
  const items = uid
    ? readScopedPersisted<Favorite[]>(
        STORAGE_KEY,
        uid,
        (state) => Array.isArray(state.items) ? state.items as Favorite[] : [],
        [],
      )
    : [];
  useFavoritesStore.setState({ items });
});
