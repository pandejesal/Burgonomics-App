/**
 * ordersStore — persisted client cache for orders and a transient
 * pointer to the "active" order (most recent, still being tracked).
 *
 * TanStack Query owns freshness in the real backend. This store is
 * for cross-screen continuity (Home → Track button, Confirmation ↔
 * History) and offline reads of previously fetched orders.
 *
 * Loop 36/120 privacy (finding 6): orders carry addresses, phone numbers
 * and item history, so persistence is scoped per signed-in user (guests
 * keep the legacy key). On identity change the in-memory map resets and
 * rehydrates from the new scope — a device shared between accounts must
 * never show user A's orders to user B. STRICT scoping: no legacy-key
 * fallback read (the legacy key may hold another account's orders).
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Order } from "@/features/orders/models";
import {
  scopedNamespacedStorage,
  browserOrMemoryStorage,
  onAuthUidChange,
  readScopedPersisted,
} from "@/features/auth/utils/scopedPersistence";

interface OrdersState {
  byId: Record<string, Order>;
  ids: string[];
  activeOrderId: string | null;

  upsert: (order: Order) => void;
  remove: (id: string) => void;
  setActiveOrderId: (id: string | null) => void;
  clearAll: () => void;
}

/**
 * Compare two unknown updatedAt stamps (ISO string | number ms | Firestore
 * Timestamp). Returns null whenever either side is missing/uncomparable —
 * the caller then keeps the incoming write (legacy parity: no guard can
 * block what we cannot rank).
 */
function updatedAtMs(value: unknown): number | null {
  try {
    if (typeof value === "number" && Number.isFinite(value)) {
      // Normalise seconds-vs-ms: anything < 1e12 is seconds.
      return value < 1e12 ? value * 1000 : value;
    }
    if (typeof value === "string" && value.length >= 8) {
      const ms = Date.parse(value);
      return Number.isFinite(ms) ? ms : null;
    }
    const ts = value as { toMillis?: unknown; seconds?: unknown } | undefined;
    if (ts && typeof ts.toMillis === "function") return Number((ts.toMillis as () => number).call(ts));
    if (ts && typeof ts.seconds === "number") return ts.seconds * 1000;
  } catch {
    return null;
  }
  return null;
}

export const useOrdersStore = create<OrdersState>()(
  persist(
    (set) => ({
      byId: {},
      ids: [],
      activeOrderId: null,

      upsert: (order) =>
        set((s) => {
          const existing = s.byId[order.id];
          // STRESS SWEEP 2026-10-24 (I): a SLOWER one-shot HTTP read (or an
          // older cached snapshot) resolving after the live onSnapshot
          // listener used to blindly clobber a newer status
          // (OUT_FOR_DELIVERY regressing to PREPARING in Order History).
          // Two fail-closed guards:
          //   1) a TERMINAL record never regresses to a non-terminal one;
          //   2) when both stamps are comparable, an older snapshot loses.
          // Absent/uncomparable stamps keep the incoming write (original
          // behavior), so this guard can never strand a legal update.
          if (existing) {
            const existingTerminal = existing.status?.terminal === true;
            const incomingTerminal = order.status?.terminal === true;
            if (existingTerminal && !incomingTerminal) {
              return s;
            }
            const existingMs = updatedAtMs(existing.updatedAt);
            const incomingMs = updatedAtMs(order.updatedAt);
            if (existingMs !== null && incomingMs !== null && existingMs > incomingMs) {
              return s;
            }
          }
          const exists = order.id in s.byId;
          const nextIds = exists ? s.ids : [order.id, ...s.ids];
          return {
            byId: { ...s.byId, [order.id]: order },
            ids: nextIds,
            activeOrderId:
              order.status.terminal && s.activeOrderId === order.id ? null : s.activeOrderId,
          };
        }),

      remove: (id) =>
        set((s) => {
          const { [id]: _dropped, ...rest } = s.byId;
          return {
            byId: rest,
            ids: s.ids.filter((x) => x !== id),
            activeOrderId: s.activeOrderId === id ? null : s.activeOrderId,
          };
        }),

      setActiveOrderId: (id) => set({ activeOrderId: id }),
      clearAll: () => set({ byId: {}, ids: [], activeOrderId: null }),
    }),
    {
      name: "burg.orders",
      version: 1,
      storage: createJSONStorage(() => scopedNamespacedStorage(browserOrMemoryStorage())),
      skipHydration: true,
      partialize: (s) => ({
        byId: s.byId,
        ids: s.ids,
        activeOrderId: s.activeOrderId,
      }),
    },
  ),
);

// Loop 36/120: re-scope on identity change — never carry user A's orders
// into user B's session. The incoming scope is read FIRST and set directly
// (poisoning-safe read; see readScopedPersisted).
interface ScopedOrders {
  byId: Record<string, Order>;
  ids: string[];
  activeOrderId: string | null;
}

const ORDERS_EMPTY: ScopedOrders = { byId: {}, ids: [], activeOrderId: null };

function readOrdersScope(uid: string | null): ScopedOrders {
  return readScopedPersisted<ScopedOrders>(
    "burg.orders",
    uid,
    (state) => {
      const byId =
        state.byId && typeof state.byId === "object" ? (state.byId as Record<string, Order>) : {};
      const ids = Array.isArray(state.ids)
        ? state.ids.filter((id): id is string => typeof id === "string" && id in byId)
        : Object.keys(byId);
      const activeOrderId =
        typeof state.activeOrderId === "string" && state.activeOrderId in byId
          ? state.activeOrderId
          : null;
      return { byId, ids, activeOrderId };
    },
    ORDERS_EMPTY,
  );
}

onAuthUidChange((uid) => {
  useOrdersStore.setState(readOrdersScope(uid));
});

// -- Selectors --------------------------------------------------------

export const selectOrderById =
  (id: string | null | undefined) =>
  (s: OrdersState): Order | null =>
    id ? (s.byId[id] ?? null) : null;

export const selectAllOrders = (s: OrdersState): Order[] =>
  s.ids.map((id) => s.byId[id]).filter(Boolean) as Order[];

export const selectActiveOrder = (s: OrdersState): Order | null =>
  s.activeOrderId ? (s.byId[s.activeOrderId] ?? null) : null;

/**
 * Legacy alias kept so existing imports (`useOrdersUi`) keep working
 * while the module is upgraded. New code should use `useOrdersStore`.
 */
export const useOrdersUi = useOrdersStore;
