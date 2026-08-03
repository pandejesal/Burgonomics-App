import { Link } from "@tanstack/react-router";
import { ChevronRight, Clock, MapPin, ShoppingBag } from "lucide-react";
import { Text } from "@/shared/components/common/Text";
import { formatINR } from "@/core/utils/format";
import type { Order } from "@/features/orders/models";
import { OrderStatusBadge } from "./OrderStatusBadge";

interface Props {
  order: Order;
}

/** OrderCard — history-list row. Fully repository-driven. */
export function OrderCard({ order }: Props) {
  const itemCount = order.items.reduce((s, l) => s + l.quantity, 0);
  const fulfillmentLabel =
    order.fulfillment === "delivery"
      ? "Delivery"
      : order.fulfillment === "takeaway"
        ? "Takeaway"
        : "Dine-in";

  return (
    <Link
      to="/orders/$orderId"
      params={{ orderId: order.id }}
      className="group block rounded-[var(--radius-large)] border border-divider bg-surface p-4 transition-colors hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={`Order ${order.shortCode}, ${order.status.label}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Text variant="caption" tone="secondary" className="tabular-nums">
            {order.shortCode} · {formatDate(order.placedAt)}
          </Text>
          <Text variant="titleLarge" className="mt-0.5 truncate">
            {order.store.name}
          </Text>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-text-secondary">
        <span className="inline-flex items-center gap-1">
          <ShoppingBag className="h-3.5 w-3.5" aria-hidden />
          <Text variant="caption" tone="secondary">
            {itemCount} items
          </Text>
        </span>
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          <Text variant="caption" tone="secondary">
            {fulfillmentLabel}
          </Text>
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          <Text variant="caption" tone="secondary">
            {formatTime(order.placedAt)}
          </Text>
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-divider pt-3">
        <Text variant="titleMedium" className="tabular-nums">
          {formatINR(order.totals.grandTotal)}
        </Text>
        <span className="inline-flex items-center gap-1 text-primary type-label-large group-hover:underline">
          View
          <ChevronRight className="h-4 w-4" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString([], {
      day: "numeric",
      month: "short",
    });
  } catch {
    return "";
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
