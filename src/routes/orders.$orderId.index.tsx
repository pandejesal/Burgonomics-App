import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RotateCcw, LifeBuoy, FileText, Share2 } from "lucide-react";

import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { AppShell } from "@/shared/layouts/AppShell";
import { AppButton } from "@/shared/components/common/AppButton";
import { Text } from "@/shared/components/common/Text";
import { Skeleton } from "@/shared/components/feedback/Skeleton";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { useHydrated } from "@/shared/hooks/useHydrated";

import {
  orderRepository,
  useOrdersStore,
  selectOrderById,
  OrderStatusBadge,
  OrderPriceSummary,
  OrderTimeline,
  FulfillmentPanel,
  type Order,
  type OrderTrackingSnapshot,
} from "@/features/orders";
import { ReviewItemsList } from "@/features/checkout";

export const Route = createFileRoute("/orders/$orderId/")({
  head: () => ({
    meta: [
      { title: "Order details — Burgonomics" },
      { name: "description", content: "Full breakdown of your order." },
    ],
  }),
  component: OrderDetailsPage,
});

function OrderDetailsPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const hydrated = useHydrated();

  const cached = useOrdersStore(selectOrderById(orderId));
  const [order, setOrder] = React.useState<Order | null>(cached);
  const [tracking, setTracking] = React.useState<OrderTrackingSnapshot | null>(null);
  const [loading, setLoading] = React.useState(!cached);

  React.useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void Promise.all([
      orderRepository.getOrder(orderId),
      orderRepository.getTracking(orderId),
    ]).then(([o, t]) => {
      if (cancelled) return;
      if (o.success) setOrder(o.data);
      if (t.success) setTracking(t.data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, orderId]);

  if (!hydrated || loading) return <DetailsSkeleton />;

  if (!order) {
    return (
      <ProtectedRoute>
        <AppShell title="Order details" backTo="/orders" showTabs={false} showTopBar>
          <EmptyState
            title="Order not found"
            description="We couldn't locate this order."
            actionLabel="View all orders"
            onAction={() => navigate({ to: "/orders" })}
          />
        </AppShell>
      </ProtectedRoute>
    );
  }

  const reorder = async () => {
    const res = await orderRepository.reorder(order.id);
    if (res.success && res.data) {
      // Placeholder — takes the user to the menu of the same store.
      navigate({ to: "/menu" });
    }
  };

  const share = async () => {
    const res = await orderRepository.buildShareMessage(order.id);
    if (!res.success) return;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title: res.data.title,
          text: res.data.text,
        });
      } catch {
        /* user cancelled */
      }
    }
  };

  return (
    <ProtectedRoute>
      <AppShell title="Order details" backTo="/orders" showTabs={false} showTopBar>
        <div className="mx-auto max-w-[560px] space-y-4 px-4 py-4">
          {/* Header */}
          <section className="rounded-[var(--radius-large)] border border-divider bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Text variant="caption" tone="secondary" className="tabular-nums">
                  {order.shortCode} · {formatDateTime(order.placedAt)}
                </Text>
                <Text variant="titleLarge" className="mt-0.5 truncate">
                  {order.store.name}
                </Text>
                <Text variant="caption" tone="secondary" className="truncate">
                  {order.store.address}
                </Text>
              </div>
              <OrderStatusBadge status={order.status} />
            </div>
          </section>

          {/* Timeline */}
          {tracking && tracking.steps.length > 0 && (
            <section className="rounded-[var(--radius-large)] border border-divider bg-surface p-4">
              <Text variant="titleLarge" className="mb-4">
                Timeline
              </Text>
              <OrderTimeline
                steps={tracking.steps}
                cancelled={order.status.kind === "cancelled" || order.status.kind === "failed"}
              />
            </section>
          )}

          {/* Fulfillment */}
          <section className="rounded-[var(--radius-large)] border border-divider bg-surface p-4">
            <FulfillmentPanel order={order} etaMinutes={tracking?.etaMinutes} />
          </section>

          {/* Items */}
          <section className="rounded-[var(--radius-large)] border border-divider bg-surface p-4">
            <Text variant="titleLarge" className="mb-3">
              Items
            </Text>
            <ReviewItemsList lines={order.items} />
            {order.notes && (
              <div className="mt-3 rounded-[var(--radius-medium)] bg-bg-secondary p-3">
                <Text variant="caption" tone="secondary">
                  Special instructions
                </Text>
                <Text variant="bodyMedium">{order.notes}</Text>
              </div>
            )}
          </section>

          {/* Price */}
          <section className="rounded-[var(--radius-large)] border border-divider bg-surface p-4">
            <Text variant="titleLarge" className="mb-3">
              Price
            </Text>
            <OrderPriceSummary totals={order.totals} promo={order.promo} />
          </section>

          {/* Payment */}
          <section className="rounded-[var(--radius-large)] border border-divider bg-surface p-4">
            <Text variant="titleLarge" className="mb-1">
              Payment
            </Text>
            <Text variant="bodyMedium" tone="secondary">
              {order.payment.label} ·{" "}
              {order.payment.status === "paid"
                ? "Paid"
                : order.payment.status === "CASH_PENDING"
                  ? "Cash Pending"
                  : order.payment.status === "PAY_AT_STORE"
                    ? "Pay at Store"
                    : order.payment.status}
            </Text>
            {order.payment.transactionId && (
              <Text variant="caption" tone="secondary" className="mt-0.5 block">
                Txn: {order.payment.transactionId}
              </Text>
            )}
          </section>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3">
            <AppButton
              variant="primary"
              iconLeft={<RotateCcw className="h-4 w-4" aria-hidden />}
              onClick={() => void reorder()}
            >
              Reorder
            </AppButton>
            <AppButton
              variant="outlined"
              iconLeft={<LifeBuoy className="h-4 w-4" aria-hidden />}
              onClick={() => navigate({ to: "/support" })}
            >
              Support
            </AppButton>
            <AppButton
              variant="outlined"
              iconLeft={<Share2 className="h-4 w-4" aria-hidden />}
              onClick={() => void share()}
            >
              Share
            </AppButton>
            <AppButton
              variant="outlined"
              iconLeft={<FileText className="h-4 w-4" aria-hidden />}
              disabled
              title="Invoice will be available once the backend is connected."
            >
              Invoice
            </AppButton>
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function DetailsSkeleton() {
  return (
    <AppShell title="Order details" backTo="/orders" showTabs={false} showTopBar>
      <div className="mx-auto max-w-[560px] space-y-3 px-4 py-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </AppShell>
  );
}
