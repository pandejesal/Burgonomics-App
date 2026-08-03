/**
 * Address state — persisted list of saved addresses + selection state.
 * The store is intentionally guest-safe (survives sign-out) so a user
 * who signs in mid-checkout keeps every field they entered.
 *
 * When the backend lands: seed the store from `addressService.list()`
 * once on login and forward every mutation via the repository. State
 * shape does not change.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Address } from "@/features/addresses/models";

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
      partialize: (s) => ({ addresses: s.addresses, selectedId: s.selectedId }),
    },
  ),
);

export const selectAddresses = (s: AddressState) => s.addresses;
export const selectSelectedAddress = (s: AddressState): Address | null => {
  const id = s.selectedId ?? s.addresses.find((a) => a.isDefault)?.id ?? null;
  return s.addresses.find((a) => a.id === id) ?? null;
};
