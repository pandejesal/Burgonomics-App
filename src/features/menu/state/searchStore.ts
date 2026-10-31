import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { menuRepository } from "@/features/menu/repositories/MenuRepository";
import type { MenuSearchKind } from "@/features/menu/services/menuService";
import type { Product, SearchSuggestion } from "@/features/menu/models";

/**
 * Search feature state — recent queries persist locally, results and
 * suggestions come from the repository.
 */
export type SearchKind = MenuSearchKind;

interface SearchState {
  query: string;
  status: "idle" | "loading" | "ready" | "empty" | "error";
  results: Product[];
  suggestions: SearchSuggestion[];
  trending: SearchSuggestion[];
  recent: string[];
  kind: SearchKind;
  error?: string;
  /** Key (`store|query|kind`) of the in-flight or last completed search. */
  activeKey?: string;

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

/**
 * Monotonic submission token. A slow earlier search resolving after a newer
 * one would otherwise write stale results (and a stale loading/error state)
 * over the screen.
 */
let requestSeq = 0;

/**
 * Last-wins tokens for the secondary lists. They are keyed separately from
 * `requestSeq` because a store switch refetches trending/suggestions without
 * changing the query, so a slow response for the previous store can otherwise
 * land after the new store's data and render as current.
 */
let trendingSeq = 0;
let suggestSeq = 0;
/** Store scope of the most recent list request; a late response for the
 * previous store is dropped instead of relabelled. */
let listScope: string | undefined;

const scopeOf = (storeId?: string) => storeId ?? "";

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
        const changed = q !== get().query;
        if (changed) requestSeq++;
        set({ query: q, ...(changed ? { activeKey: undefined } : {}) });
        if (!q.trim()) {
          // Clearing the box also clears the dedupe key, so re-typing a term
          // that was already searched searches again instead of staying idle.
          set({ suggestions: [], results: [], status: "idle", error: undefined, activeKey: undefined });
        }
      },

      setKind(k) {
        const changed = k !== get().kind;
        if (changed) requestSeq++;
        set({ kind: k, ...(changed ? { activeKey: undefined } : {}) });
      },

      async submit(storeId) {
        const q = get().query.trim();
        if (!q) return;
        const kind = get().kind;
        const key = `${storeId ?? ""}|${q.toLowerCase()}|${kind}`;

        // One repository call per user intent: a deep link submits from the
        // URL sync effect AND from the 300ms debounce, Enter races the pending
        // debounce, and a kind tab re-submit reuses the same query. Same key
        // means the work is already running or already on screen — only a
        // failure may retry it.
        if (get().activeKey === key && get().status !== "error") return;

        const seq = ++requestSeq;
        set({ status: "loading", error: undefined, activeKey: key });
        try {
          const res = await menuRepository.search(storeId, q, { kind });
          if (seq !== requestSeq) return; // a newer search owns the screen
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
        } catch {
          // A rejected repository call must not strand the UI on the loading
          // skeleton forever.
          if (seq !== requestSeq) return;
          set({ status: "error", error: "Search failed. Please try again.", results: [] });
        }
      },

      async fetchSuggestions(storeId) {
        const q = get().query.trim();
        if (q.length < 2) {
          suggestSeq += 1;
          set({ suggestions: [] });
          return;
        }
        const seq = ++suggestSeq;
        const scope = scopeOf(storeId);
        listScope = scope;
        const seqAtStart = requestSeq;
        try {
          const res = await menuRepository.suggest(storeId, q);
          const stillCurrent =
            seq === suggestSeq &&
            seqAtStart === requestSeq &&
            scope === listScope &&
            q === get().query.trim();
          if (res.success && stillCurrent) {
            set({ suggestions: res.data });
          }
        } catch {
          if (seq === suggestSeq && q === get().query.trim()) set({ suggestions: [] });
        }
      },

      async fetchTrending(storeId) {
        const seq = ++trendingSeq;
        const scope = scopeOf(storeId);
        listScope = scope;
        try {
          const res = await menuRepository.listTrending(storeId);
          // A store switch issues a newer request; the old store's chips must
          // not replace the new store's list when they resolve last.
          if (seq !== trendingSeq || scope !== listScope) return;
          if (res.success) set({ trending: res.data });
        } catch {
          // Trending is decorative: a rejected call must not strand stale chips
          // or surface an unhandled rejection.
        }
      },

      clearRecent() {
        set({ recent: [] });
      },
      removeRecent(q) {
        set((s) => ({ recent: s.recent.filter((x) => x !== q) }));
      },

      reset() {
        requestSeq++;
        set({ query: "", status: "idle", results: [], suggestions: [], error: undefined, activeKey: undefined });
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
