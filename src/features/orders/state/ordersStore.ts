/**
 * ordersStore — persisted client cache for orders and a transient
 * pointer to the "active" order (most recent, still being tracked).
 *
 * TanStack Query owns freshness in the real backend. This store is
 * for cross-screen continuity (Home → Track button, Confirmation ↔
 * History) and offline reads of previously fetched orders.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Order } from "@/features/orders/models";

interface OrdersState {
  byId: Record<string, Order>;
  ids: string[];
  activeOrderId: string | null;

  upsert: (order: Order) => void;
  remove: (id: string) => void;
  setActiveOrderId: (id: string | null) => void;
  clearAll: () => void;
}

export const useOrdersStore = create<OrdersState>()(
  persist(
    (set) => ({
      byId: {},
      ids: [],
      activeOrderId: null,

      upsert: (order) =>
        set((s) => {
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
      skipHydration: true,
      partialize: (s) => ({
        byId: s.byId,
        ids: s.ids,
        activeOrderId: s.activeOrderId,
      }),
    },
  ),
);

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
