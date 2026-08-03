import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { menuRepository } from "@/features/menu/repositories/MenuRepository";
import type { Product, SearchSuggestion } from "@/features/menu/models";

/**
 * Search feature state — recent queries persist locally, results and
 * suggestions come from the repository.
 */
export type SearchKind = "all" | "product" | "combo" | "category" | "offer";

interface SearchState {
  query: string;
  status: "idle" | "loading" | "ready" | "empty" | "error";
  results: Product[];
  suggestions: SearchSuggestion[];
  trending: SearchSuggestion[];
  recent: string[];
  kind: SearchKind;
  error?: string;

  setQuery: (q: string) => void;
  setKind: (k: SearchKind) => void;
  submit: (storeId?: string) => Promise<void>;
  fetchSuggestions: (storeId?: string) => Promise<void>;
  fetchTrending: (storeId?: string) => Promise<void>;
  clearRecent: () => void;
  removeRecent: (q: string) => void;
  reset: () => void;
}

const MAX_RECENT = 8;

export const useSearchStore = create<SearchState>()(
  persist(
    (set, get) => ({
      query: "",
      status: "idle",
      results: [],
      suggestions: [],
      trending: [],
      recent: [],
      kind: "all",

      setQuery(q) {
        set({ query: q });
        if (!q.trim()) set({ suggestions: [], results: [], status: "idle" });
      },

      setKind(k) {
        set({ kind: k });
      },

      async submit(storeId) {
        const q = get().query.trim();
        if (!q) return;
        set({ status: "loading", error: undefined });
        const res = await menuRepository.search(storeId, q);
        if (!res.success) {
          set({ status: "error", error: res.error.message, results: [] });
          return;
        }
        const items = res.data.items;
        set((s) => ({
          status: items.length ? "ready" : "empty",
          results: items,
          recent: [q, ...s.recent.filter((x) => x !== q)].slice(0, MAX_RECENT),
        }));
      },

      async fetchSuggestions(storeId) {
        const q = get().query.trim();
        if (q.length < 2) {
          set({ suggestions: [] });
          return;
        }
        const res = await menuRepository.suggest(storeId, q);
        if (res.success) set({ suggestions: res.data });
      },

      async fetchTrending(storeId) {
        const res = await menuRepository.listTrending(storeId);
        if (res.success) set({ trending: res.data });
      },

      clearRecent() {
        set({ recent: [] });
      },
      removeRecent(q) {
        set((s) => ({ recent: s.recent.filter((x) => x !== q) }));
      },

      reset() {
        set({ query: "", status: "idle", results: [], suggestions: [], error: undefined });
      },
    }),
    {
      name: "burg.search",
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
      partialize: (s) => ({ recent: s.recent }),
      skipHydration: true,
    },
  ),
);
