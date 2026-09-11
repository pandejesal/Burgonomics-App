/**
 * Address state — persisted list of saved addresses + selection state.
 *
 * Loop 36/120 privacy: addresses hold contact names/phones + home locations,
 * so persistence is scoped per signed-in user (guests keep the legacy key).
 * On identity change the in-memory list resets and rehydrates from the new
 * scope — a mid-checkout sign-in drops guest-entered rows (re-enter once)
 * rather than leaking another device user's addresses. The legacy key is
 * never migrated into a signed-in scope.
 *
 * When the backend lands: seed the store from `addressService.list()`
 * once on login and forward every mutation via the repository. State
 * shape does not change.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Address } from "@/features/addresses/models";
import { useAuthStore } from "@/features/auth/state/authStore";

// Loop 36/120: namespace every persist key by signed-in user id. Guests
// (uid null) keep the legacy unscoped key.
export const addressStorageKey = (key: string, uid?: string | null): string =>
  uid ? `${key}::${uid}` : key;

const scopedKey = (key: string): string => {
  const uid = useAuthStore.getState().user?.id;
  return addressStorageKey(key, uid);
};

function namespacedStorage(base: Storage): Storage {
  return {
    getItem: (key: string) => base.getItem(scopedKey(key)),
    setItem: (key: string, value: string) => base.setItem(scopedKey(key), value),
    removeItem: (key: string) => base.removeItem(scopedKey(key)),
    clear: () => base.clear(),
    get length() {
      return base.length;
    },
    key: (index: number) => base.key(index),
  };
}

interface AddressState {
  addresses: Address[];
  selectedId: string | null;

  upsert: (a: Address) => void;
  update: (id: string, patch: Partial<Address>) => void;
  remove: (id: string) => void;
  setDefault: (id: string) => void;
  select: (id: string | null) => void;
  clear: () => void;
}

export const useAddressStore = create<AddressState>()(
  persist(
    (set, get) => ({
      addresses: [],
      selectedId: null,

      upsert: (a) =>
        set((s) => {
          const others = s.addresses.filter((x) => x.id !== a.id);
          // Enforce single-default invariant.
          const cleaned = a.isDefault ? others.map((x) => ({ ...x, isDefault: false })) : others;
          const list = [...cleaned, a];
          // First address auto-selects and becomes default.
          const isFirst = s.addresses.length === 0;
          return {
            addresses: isFirst ? [{ ...a, isDefault: true }] : list,
            selectedId: s.selectedId ?? a.id,
          };
        }),

      update: (id, patch) =>
        set((s) => ({
          addresses: s.addresses.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),

      remove: (id) =>
        set((s) => {
          const list = s.addresses.filter((a) => a.id !== id);
          const removedDefault = s.addresses.find((a) => a.id === id)?.isDefault;
          if (removedDefault && list[0]) list[0] = { ...list[0], isDefault: true };
          return {
            addresses: list,
            selectedId:
              s.selectedId === id
                ? (list.find((a) => a.isDefault)?.id ?? list[0]?.id ?? null)
                : s.selectedId,
          };
        }),

      setDefault: (id) =>
        set((s) => ({
          addresses: s.addresses.map((a) => ({ ...a, isDefault: a.id === id })),
        })),

      select: (id) => set({ selectedId: id }),

      clear: () => set({ addresses: [], selectedId: null }),
    }),
    {
      name: "burg.addresses",
      version: 1,
      storage: createJSONStorage(() => {
        if (typeof window !== "undefined" && window.localStorage)
          return namespacedStorage(window.localStorage);
        const memoryStorage = new Map<string, string>();
        return namespacedStorage({
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
        } as Storage);
      }),
      partialize: (s) => ({ addresses: s.addresses, selectedId: s.selectedId }),
    },
  ),
);

// Loop 36/120: re-scope on identity change — reset in-memory rows (never
// carry user A's addresses into user B's session) and rehydrate the new
// scope. Runs on module import; no-ops until the first login/logout.
let lastAddressUid: string | null | undefined = undefined;
useAuthStore.subscribe((s) => {
  const uid = s.user?.id ?? null;
  if (uid === lastAddressUid) return;
  lastAddressUid = uid;
  useAddressStore.setState({ addresses: [], selectedId: null });
  void useAddressStore.persist.rehydrate();
});

export const selectAddresses = (s: AddressState) => s.addresses;
export const selectSelectedAddress = (s: AddressState): Address | null => {
  const id = s.selectedId ?? s.addresses.find((a) => a.isDefault)?.id ?? null;
  return s.addresses.find((a) => a.id === id) ?? null;
};
