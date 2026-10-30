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
 *
 * D31–D33: loyalty redemption is withdrawn from the customer app. The
 * field survives only so legacy persisted state can be read; every write
 * is forced to 0 and the order/payment payloads pin 0 independently.
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
import {
  applyOrderNotesEdit,
  sanitizePersistedOrderNotes,
} from "@/features/checkout/utils/orderNotes";

export type CheckoutStatus =
  | "idle"
  | "loading"
  | "guest"
  | "authenticated"
  | "address_required"
  | "invalid"
  | "ready"
  | "error";

interface NotesScope {
  uid: string | null;
  storeId: string | null;
}

/**
 * A captured mark of the draft that existed BEFORE an async order/payment
 * call. Clearing is only allowed while the draft is still exactly this one —
 * a newer draft written under the same account/outlet must survive a slow
 * completion of the previous order.
 */
export interface NotesDraftMark extends NotesScope {
  /** Monotonic draft revision at capture time. */
  revision: number;
}

interface CheckoutState {
  /** Kitchen/order note. At most 240 UTF-16 units; overflow is rejected. */
  orderNotes: string;
  /**
   * Oversized note inherited from an older build (`> 240` units). Held for
   * explicit review, never included in an order, and blocks payment until
   * the customer resolves it.
   */
  legacyOrderNotes: string;
  deliveryInstructions: string;
  pickupInstructions: string;
  diningNotes: string;
  tableNumber: string;
  /** Delivery-partner tip (₹) chosen on the cart screen. Persisted so it
   * reaches the order + payment payloads instead of dying in local state. */
  tipAmount: number;
  /**
   * Legacy loyalty redemption choice. D31–D33 withdrew redemption from the
   * customer app; the field is kept for storage-shape compatibility and is
   * always 0. Transport layers pin 0 as well, so a stale persisted value can
   * never reach an order or payment payload.
   */
  loyaltyPointsToRedeem: number;
  /**
   * Live delivery-fee quote for the current order. NOT persisted: a quote is
   * only valid for the basket it was taken against, so a stale one restored
   * from localStorage would show a fee the backend will not honour. The
   * sandbox quote applies until a fresh one arrives.
   */
  deliveryQuote: DeliveryQuote;

  /** Account/outlet the current draft was written under (lifecycle fence). */
  notesScope: NotesScope | null;
  /**
   * Monotonic draft revision. Incremented on every note write, legacy
   * resolution and scope reset, so an order that finishes late can clear only
   * the exact draft it was placed with — never a newer note typed while the
   * payment was in flight under the same account/outlet.
   */
  notesRevision: number;

  /** Returns false when the change was rejected (over the 240-unit ceiling). */
  setOrderNotes: (v: string) => boolean;
  setDeliveryInstructions: (v: string) => void;
  setPickupInstructions: (v: string) => void;
  setDiningNotes: (v: string) => void;
  setTableNumber: (v: string) => void;
  setTipAmount: (v: number) => void;
  setLoyaltyPointsToRedeem: (v: number) => void;
  setDeliveryQuote: (q: DeliveryQuote) => void;
  /** Explicit legacy-review outcome. `value` is the accepted note. */
  resolveLegacyOrderNotes: (decision: "keep" | "discard", value?: string) => void;
  /** Adopt or clear a draft when the account/outlet scope changes. */
  bindNotesScope: (uid: string | null, storeId: string | null) => void;
  /**
   * Capture the draft identity BEFORE an async place/pay call. `revision` plus
   * the account/outlet pair is what `clearNotesAfterCompletedOrder` compares.
   */
  captureNotesDraft: (uid: string | null, storeId: string | null) => NotesDraftMark;
  /**
   * Clear the draft after a completed order — only while it is still the exact
   * draft (scope + revision) that placed it. A newer draft written under the
   * same account/outlet while the order was in flight is preserved.
   */
  clearNotesAfterCompletedOrder: (mark: NotesDraftMark) => void;
  reset: () => void;
}

const initial = {
  orderNotes: "",
  legacyOrderNotes: "",
  deliveryInstructions: "",
  pickupInstructions: "",
  diningNotes: "",
  tableNumber: "",
  tipAmount: 0,
  loyaltyPointsToRedeem: 0,
  deliveryQuote: SANDBOX_DELIVERY_QUOTE,
  notesScope: null as NotesScope | null,
  notesRevision: 0,
};

export const useCheckoutStore = create<CheckoutState>()(
  persist(
    (set, get) => ({
      ...initial,
      setOrderNotes: (v) => {
        const current = get();
        const result = applyOrderNotesEdit(current.orderNotes, v);
        if (!result.ok) return false;
        set({ orderNotes: result.value, notesRevision: current.notesRevision + 1 });
        return true;
      },
      setDeliveryInstructions: (v) => set({ deliveryInstructions: v.slice(0, 160) }),
      setPickupInstructions: (v) => set({ pickupInstructions: v.slice(0, 160) }),
      setDiningNotes: (v) => set({ diningNotes: v.slice(0, 160) }),
      setTableNumber: (v) => set({ tableNumber: v.slice(0, 20) }),
      setTipAmount: (v) =>
        set({ tipAmount: Number.isFinite(v) ? Math.min(10000, Math.max(0, Math.floor(v))) : 0 }),
      // D31–D33: redemption withdrew from the customer app — always zero.
      setLoyaltyPointsToRedeem: () => set({ loyaltyPointsToRedeem: 0 }),
      // Defensive: a corrupt/negative quote must never price a ₹0 delivery.
      setDeliveryQuote: (q) =>
        set({
          deliveryQuote:
            q && Number.isFinite(q.fee) && q.fee >= 0
              ? { ...q, fee: Math.round(q.fee * 100) / 100 }
              : SANDBOX_DELIVERY_QUOTE,
        }),
      resolveLegacyOrderNotes: (decision, value) => {
        if (decision === "discard" || typeof value !== "string") {
          set({ legacyOrderNotes: "", notesRevision: get().notesRevision + 1 });
          return;
        }
        const accepted = applyOrderNotesEdit("", value);
        // Only an in-range note may replace the oversized draft; anything
        // still over the ceiling stays in review instead of being truncated.
        if (!accepted.ok) return;
        set({
          orderNotes: accepted.value,
          legacyOrderNotes: "",
          notesRevision: get().notesRevision + 1,
        });
      },
      bindNotesScope: (uid, storeId) => {
        const current = get();
        const binding = current.notesScope;
        if (!binding) {
          set({ notesScope: { uid, storeId } });
          return;
        }
        const outletChanged =
          binding.storeId !== null && storeId !== null && binding.storeId !== storeId;
        const accountChanged =
          binding.uid !== null && uid !== null && binding.uid !== uid;
        if (outletChanged || accountChanged) {
          set({
            orderNotes: "",
            legacyOrderNotes: "",
            notesScope: { uid, storeId },
            notesRevision: current.notesRevision + 1,
          });
          return;
        }
        // Adopt a guest draft into the signed-in scope (guest → auth handoff).
        // The keystrokes are preserved, but this is a new draft generation for
        // any order that captured the guest mark.
        if (binding.uid === null && uid !== null) {
          set({ notesScope: { uid, storeId }, notesRevision: current.notesRevision + 1 });
        }
      },
      captureNotesDraft: (uid, storeId) => ({
        uid,
        storeId,
        revision: get().notesRevision,
      }),
      clearNotesAfterCompletedOrder: (mark) => {
        const current = get();
        const binding = current.notesScope;
        const sameDraft =
          binding !== null &&
          binding.uid === mark.uid &&
          binding.storeId === mark.storeId &&
          current.notesRevision === mark.revision;
        // uid+outlet alone is not enough: a newer draft may have been typed
        // under the SAME account/outlet while this order was being paid. Only
        // the exact revision captured before the order clears.
        if (!sameDraft) return;
        set({ orderNotes: "", legacyOrderNotes: "", notesRevision: current.notesRevision + 1 });
      },
      reset: () =>
        set((current) => ({ ...initial, notesRevision: current.notesRevision + 1 })),
    }),
    {
      name: "burg.checkout",
      version: 4,
      storage: createJSONStorage(() =>
        scopedNamespacedStorage(browserOrMemoryStorage(), { legacyFallbackRead: true }),
      ),
      partialize: (s) => ({
        orderNotes: s.orderNotes,
        legacyOrderNotes: s.legacyOrderNotes,
        deliveryInstructions: s.deliveryInstructions,
        pickupInstructions: s.pickupInstructions,
        diningNotes: s.diningNotes,
        tableNumber: s.tableNumber,
        tipAmount: s.tipAmount,
        loyaltyPointsToRedeem: s.loyaltyPointsToRedeem,
        notesScope: s.notesScope,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        const sanitized = sanitizePersistedOrderNotes(p.orderNotes, p.legacyOrderNotes);
        return {
          ...current,
          ...(persisted as Partial<CheckoutState>),
          orderNotes: sanitized.orderNotes,
          legacyOrderNotes: sanitized.legacyOrderNotes,
          // A persisted redemption choice from the withdrawn wallet feature
          // must never be revived by a reload or a deep link.
          loyaltyPointsToRedeem: 0,
          // The revision is runtime-only: it exists to fence an in-flight
          // order, and a reload starts a fresh draft timeline. Bump it so an
          // order captured before the reload cannot clear the restored draft.
          notesRevision: (current.notesRevision ?? 0) + 1,
          notesScope:
            p.notesScope && typeof p.notesScope === "object"
              ? (p.notesScope as NotesScope)
              : null,
        };
      },
      // v3 → v4 only added the legacy-review field; the sanitizer in `merge`
      // decides what survives, so an upgrade keeps the customer's draft.
      migrate: (persisted) => persisted as CheckoutState,
    },
  ),
);

// Loop 36/120 (finding 6): re-scope on identity change — never carry user
// A's notes into user B's session. Incoming scope read first (poisoning-
// safe); the legacy fallback preserves the guest→login handoff above.
interface ScopedCheckout {
  orderNotes: string;
  legacyOrderNotes: string;
  deliveryInstructions: string;
  pickupInstructions: string;
  diningNotes: string;
  tableNumber: string;
  tipAmount: number;
  loyaltyPointsToRedeem: number;
}

const CHECKOUT_EMPTY: ScopedCheckout = {
  orderNotes: "",
  legacyOrderNotes: "",
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
    (state) => {
      const sanitized = sanitizePersistedOrderNotes(state.orderNotes, state.legacyOrderNotes);
      return {
        orderNotes: sanitized.orderNotes,
        legacyOrderNotes: sanitized.legacyOrderNotes,
        deliveryInstructions: str(state.deliveryInstructions, 160),
        pickupInstructions: str(state.pickupInstructions, 160),
        diningNotes: str(state.diningNotes, 160),
        tableNumber: str(state.tableNumber, 20),
        tipAmount: nonNegInt(state.tipAmount, 10000),
        loyaltyPointsToRedeem: 0,
      };
    },
    CHECKOUT_EMPTY,
    true,
  );
}

onAuthUidChange((uid) => {
  useCheckoutStore.setState((current) => ({
    ...readCheckoutScope(uid),
    notesScope: null,
    // A new identity is a new draft generation: an in-flight order from the
    // previous account must not clear what this one is writing.
    notesRevision: (current.notesRevision ?? 0) + 1,
  }));
});
