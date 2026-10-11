/**
 * Checkout UI state. Owns the *form* fields collected on the Checkout
 * screen — order-level notes and fulfillment-specific instructions.
 * All of these are persisted so a mid-flow auth round-trip preserves
 * every keystroke.
 *
 * Cart lines, store, and fulfillment method are NOT owned here — they
 * remain in `useCartStore` and `useStoreSelection` respectively.
 *
 * Loop 36/120 privacy (finding 6): notes/instructions are persisted
 * per signed-in user (guests keep the legacy key). Unlike orders, this
 * store KEEPS the legacy-key fallback read: a guest who enters notes and
 * then signs in mid-checkout must keep their keystrokes (documented
 * behaviour above) — the fallback only fires while the signed-in scope
 * is empty, so populated scopes never mix.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { SANDBOX_DELIVERY_QUOTE, type DeliveryQuote } from "@/features/checkout/services/deliveryQuoteService";
import {
  scopedNamespacedStorage,
  browserOrMemoryStorage,
  onAuthUidChange,
  readScopedPersisted,
} from "@/features/auth/utils/scopedPersistence";

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
  /**
   * Live delivery-fee quote for the current order. NOT persisted: a quote is
   * only valid for the basket it was taken against, so a stale one restored
   * from localStorage would show a fee the backend will not honour. The
   * sandbox quote applies until a fresh one arrives.
   */
  deliveryQuote: DeliveryQuote;

  setOrderNotes: (v: string) => void;
  setDeliveryInstructions: (v: string) => void;
  setPickupInstructions: (v: string) => void;
  setDiningNotes: (v: string) => void;
  setTableNumber: (v: string) => void;
  setTipAmount: (v: number) => void;
  setLoyaltyPointsToRedeem: (v: number) => void;
  setDeliveryQuote: (q: DeliveryQuote) => void;
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
  deliveryQuote: SANDBOX_DELIVERY_QUOTE,
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
      // Defensive: a corrupt/negative quote must never price a ₹0 delivery.
      setDeliveryQuote: (q) =>
        set({
          deliveryQuote:
            q && Number.isFinite(q.fee) && q.fee >= 0
              ? { ...q, fee: Math.round(q.fee * 100) / 100 }
              : SANDBOX_DELIVERY_QUOTE,
        }),
      reset: () => set({ ...initial }),
    }),
    {
      name: "burg.checkout",
      version: 3,
      storage: createJSONStorage(() =>
        scopedNamespacedStorage(browserOrMemoryStorage(), { legacyFallbackRead: true }),
      ),
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

// Loop 36/120 (finding 6): re-scope on identity change — never carry user
// A's notes into user B's session. Incoming scope read first (poisoning-
// safe); the legacy fallback preserves the guest→login handoff above.
interface ScopedCheckout {
  orderNotes: string;
  deliveryInstructions: string;
  pickupInstructions: string;
  diningNotes: string;
  tableNumber: string;
  tipAmount: number;
  loyaltyPointsToRedeem: number;
}

const CHECKOUT_EMPTY: ScopedCheckout = {
  orderNotes: "",
  deliveryInstructions: "",
  pickupInstructions: "",
  diningNotes: "",
  tableNumber: "",
  tipAmount: 0,
  loyaltyPointsToRedeem: 0,
};

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";
const nonNegInt = (v: unknown, max: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0;

function readCheckoutScope(uid: string | null): ScopedCheckout {
  return readScopedPersisted<ScopedCheckout>(
    "burg.checkout",
    uid,
    (state) => ({
      orderNotes: str(state.orderNotes, 240),
      deliveryInstructions: str(state.deliveryInstructions, 160),
      pickupInstructions: str(state.pickupInstructions, 160),
      diningNotes: str(state.diningNotes, 160),
      tableNumber: str(state.tableNumber, 20),
      tipAmount: nonNegInt(state.tipAmount, 10000),
      loyaltyPointsToRedeem: nonNegInt(state.loyaltyPointsToRedeem, 100000),
    }),
    CHECKOUT_EMPTY,
    true,
  );
}

onAuthUidChange((uid) => {
  useCheckoutStore.setState(readCheckoutScope(uid));
});
