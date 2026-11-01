import * as React from "react";
import { Link } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";

import { formatINR } from "@/core/utils/format";
import { useAuthStore, selectIsAuthenticated } from "@/features/auth/state/authStore";
import { useCartStore } from "@/features/cart/state/cartStore";
import { orderRepository } from "../repositories/OrderRepository";
import { useReorderItems } from "../hooks/useReorderItems";
import { ReorderDialogs } from "./ReorderDialogs";
import type { Order } from "../models";

/** Server-side bound for the empty-cart rail — never an unbounded history read. */
const RECENT_REORDER_LIMIT = 5;

interface RecentOrdersRailProps {
  /** Route-level gate; the component also self-guards (auth + empty cart). */
  enabled?: boolean;
}

function isEligible(order: Order): boolean {
  return order.status?.kind === "completed" && Array.isArray(order.items) && order.items.length > 0;
}

/**
 * Empty-cart "order again" rail.
 *
 * Reads are strictly gated: a guest issues ZERO history reads, and a cart that
 * already has items never mounts this surface. The read itself is bounded by
 * the order API (`bucket: completed`, `pageSize: 5`).
 */
export function RecentOrdersRail({ enabled = true }: RecentOrdersRailProps) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const uid = useAuthStore((s) => s.user?.id ?? null);
  const hasCartItems = useCartStore((s) => s.lines.length > 0);

  const cartEmpty = !hasCartItems;
  const active = enabled && isAuthenticated && cartEmpty && uid !== null;

  const [orders, setOrders] = React.useState<Order[]>([]);
  const [loading, setLoading] = React.useState(false);

  const {
    reorder,
    isReordering,
    outOfStockModal,
    confirmReorderRemaining,
    dismissOutOfStockModal,
    pendingConfirmation,
    confirmPendingReorder,
    cancelPendingReorder,
  } = useReorderItems();

  React.useEffect(() => {
    if (!active) {
      setOrders([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const requestedUid = uid;
    setLoading(true);
    void (async () => {
      const result = await orderRepository.listOrders({
        bucket: "past",
        pageSize: RECENT_REORDER_LIMIT,
      });
      // Abort a stale response: the account or the cart may have changed while
      // the read was in flight.
      if (cancelled) return;
      if ((useAuthStore.getState().user?.id ?? null) !== requestedUid) return;
      if (useCartStore.getState().lines.length > 0) return;
      setLoading(false);
      if (!result.success) {
        setOrders([]);
        return;
      }
      setOrders(result.data.items.filter(isEligible).slice(0, RECENT_REORDER_LIMIT));
    })();
    return () => {
      cancelled = true;
    };
  }, [active, uid]);

  if (!active || (!loading && orders.length === 0)) return null;

  return (
    <section aria-labelledby="recent-orders-heading" className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="recent-orders-heading" className="text-base font-semibold text-text">
          Order again
        </h2>
        <Link to="/orders" className="text-sm font-medium text-primary hover:underline">
          All orders
        </Link>
      </div>

      {loading ? (
        <p role="status" className="text-sm text-text-secondary">
          Loading your recent orders…
        </p>
      ) : (
        <ul className="space-y-2">
          {orders.map((order) => (
            <li
              key={order.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-divider bg-surface p-3.5 shadow-xs"
            >
              <div className="min-w-0">
                <p className="truncate text-base font-medium text-text">
                  {order.store?.name ?? "Burgonomics"}
                </p>
                <p className="text-sm text-text-secondary">
                  #{order.shortCode || order.id.slice(-6).toUpperCase()} • {order.items.length}{" "}
                  {order.items.length === 1 ? "item" : "items"} •{" "}
                  {formatINR(order.totals?.grandTotal ?? 0)}
                </p>
              </div>
              <button
                type="button"
                disabled={isReordering || pendingConfirmation !== null || outOfStockModal.isOpen}
                onClick={() => void reorder(order)}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                Reorder
              </button>
            </li>
          ))}
        </ul>
      )}

      <ReorderDialogs
        outOfStockModal={outOfStockModal}
        pendingConfirmation={pendingConfirmation}
        busy={isReordering}
        onConfirmRemaining={() => void confirmReorderRemaining()}
        onDismissOutOfStock={dismissOutOfStockModal}
        onConfirm={() => void confirmPendingReorder()}
        onCancel={cancelPendingReorder}
      />
    </section>
  );
}

export default RecentOrdersRail;
