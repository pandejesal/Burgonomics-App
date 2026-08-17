/**
 * Checkout UI state. Owns the *form* fields collected on the Checkout
 * screen — order-level notes and fulfillment-specific instructions.
 * All of these are persisted so a mid-flow auth round-trip preserves
 * every keystroke.
 *
 * Cart lines, store, and fulfillment method are NOT owned here — they
 * remain in `useCartStore` and `useStoreSelection` respectively.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type CheckoutStatus =
  | "idle"
  | "loading"
  | "guest"
  | "authenticated"
  | "address_required"
  | "invalid"
  | "ready"
  | "error";

interface CheckoutState {
  orderNotes: string;
  deliveryInstructions: string;
  pickupInstructions: string;
  diningNotes: string;
  tableNumber: string;

  setOrderNotes: (v: string) => void;
  setDeliveryInstructions: (v: string) => void;
  setPickupInstructions: (v: string) => void;
  setDiningNotes: (v: string) => void;
  setTableNumber: (v: string) => void;
  reset: () => void;
}

const initial = {
  orderNotes: "",
  deliveryInstructions: "",
  pickupInstructions: "",
  diningNotes: "",
  tableNumber: "",
};

export const useCheckoutStore = create<CheckoutState>()(
  persist(
    (set) => ({
      ...initial,
      setOrderNotes: (v) => set({ orderNotes: v.slice(0, 240) }),
      setDeliveryInstructions: (v) => set({ deliveryInstructions: v.slice(0, 160) }),
      setPickupInstructions: (v) => set({ pickupInstructions: v.slice(0, 160) }),
      setDiningNotes: (v) => set({ diningNotes: v.slice(0, 160) }),
      setTableNumber: (v) => set({ tableNumber: v.slice(0, 20) }),
      reset: () => set({ ...initial }),
    }),
    {
      name: "burg.checkout",
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
      partialize: (s) => ({
        orderNotes: s.orderNotes,
        deliveryInstructions: s.deliveryInstructions,
        pickupInstructions: s.pickupInstructions,
        diningNotes: s.diningNotes,
        tableNumber: s.tableNumber,
      }),
    },
  ),
);
