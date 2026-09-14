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
  /** Delivery-partner tip (₹) chosen on the cart screen. Persisted so it
   * reaches the order + payment payloads instead of dying in local state. */
  tipAmount: number;
  /** Loyalty points the user chose to redeem (1 pt = ₹1, capped at 20%
   * of subtotal at charge time). Persisted so the choice survives the
   * checkout → payment navigation. */
  loyaltyPointsToRedeem: number;

  setOrderNotes: (v: string) => void;
  setDeliveryInstructions: (v: string) => void;
  setPickupInstructions: (v: string) => void;
  setDiningNotes: (v: string) => void;
  setTableNumber: (v: string) => void;
  setTipAmount: (v: number) => void;
  setLoyaltyPointsToRedeem: (v: number) => void;
  reset: () => void;
}

const initial = {
  orderNotes: "",
  deliveryInstructions: "",
  pickupInstructions: "",
  diningNotes: "",
  tableNumber: "",
  tipAmount: 0,
  loyaltyPointsToRedeem: 0,
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
      setTipAmount: (v) =>
        set({ tipAmount: Number.isFinite(v) ? Math.min(10000, Math.max(0, Math.floor(v))) : 0 }),
      setLoyaltyPointsToRedeem: (v) =>
        set({
          loyaltyPointsToRedeem: Number.isFinite(v) ? Math.min(100000, Math.max(0, Math.floor(v))) : 0,
        }),
      reset: () => set({ ...initial }),
    }),
    {
      name: "burg.checkout",
      version: 3,
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
        tipAmount: s.tipAmount,
        loyaltyPointsToRedeem: s.loyaltyPointsToRedeem,
      }),
    },
  ),
);
