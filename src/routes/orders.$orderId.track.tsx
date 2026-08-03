import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RefreshCw, Phone, WifiOff, AlertCircle } from "lucide-react";

import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { AppShell } from "@/shared/layouts/AppShell";
import { AppButton } from "@/shared/components/common/AppButton";
import { Text } from "@/shared/components/common/Text";
import { Skeleton } from "@/shared/components/feedback/Skeleton";
import { Spinner } from "@/shared/components/feedback/Spinner";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { useHydrated } from "@/shared/hooks/useHydrated";

import {
  orderRepository,
  useOrdersStore,
  selectOrderById,
  useOrderTracking,
  OrderTimeline,
  OrderStatusBadge,
  FulfillmentPanel,
  type Order,
} from "@/features/orders";

export const Route = createFileRoute("/orders/$orderId/track")({
  head: () => ({
    meta: [
      { title: "Track order — Burgonomics" },
      { name: "description", content: "Live status of your order." },
    ],
  }),
  component: TrackOrderPage,
});

function TrackOrderPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const hydrated = useHydrated();

  const cachedOrder = useOrdersStore(selectOrderById(orderId));
  const [order, setOrder] = React.useState<Order | null>(cachedOrder);
  const [loadingOrder, setLoadingOrder] = React.useState(!cachedOrder);

  const tracking = useOrderTracking(hydrated ? orderId : null);

  React.useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void orderRepository.getOrder(orderId).then((res) => {
      if (cancelled) return;
      if (res.success) setOrder(res.data);
      setLoadingOrder(false);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, orderId]);

  // Reflect status updates from tracking back into local order copy.
  React.useEffect(() => {
    if (!order || !tracking.snapshot) return;
    if (tracking.snapshot.status.code !== order.status.code) {
      setOrder({ ...order, status: tracking.snapshot.status });
    }
  }, [order, tracking.snapshot]);

  if (!hydrated || loadingOrder) return <TrackSkeleton />;

  if (!order) {
    return (
      <ProtectedRoute>
        <AppShell title="Track order" backTo="/orders" showTabs={false} showTopBar>
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

  const snapshot = tracking.snapshot;
  const cancelled = order.status.kind === "cancelled" || order.status.kind === "failed";

  return (
    <ProtectedRoute>
      <AppShell
        title="Track order"
        backTo="/orders"
        showTabs={false}
        showTopBar
        rightSlot={
          <button
            aria-label="Refresh"
            onClick={() => void tracking.refresh()}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-text-primary hover:bg-bg-secondary"
          >
            <RefreshCw
              className={`h-5 w-5 ${tracking.status === "refreshing" ? "animate-spin" : ""}`}
              aria-hidden
            />
          </button>
        }
      >
        <div className="mx-auto max-w-[560px] space-y-4 px-4 py-4">
          {/* Header */}
          <section
            aria-label="Order status"
            className="rounded-[var(--radius-large)] border border-divider bg-surface p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Text variant="caption" tone="secondary" className="tabular-nums">
                  {order.shortCode}
                </Text>
                <Text variant="titleLarge" className="mt-0.5">
                  {order.status.label}
                </Text>
              </div>
              <OrderStatusBadge status={order.status} />
            </div>
            {tracking.status === "tracking" && !order.status.terminal && (
              <div
                className="mt-3 flex items-center gap-2 text-text-secondary"
                role="status"
                aria-live="polite"
              >
                <Spinner />
                <Text variant="caption" tone="secondary">
                  Tracking live updates…
                </Text>
              </div>
            )}
            {tracking.status === "offline" && (
              <div className="mt-3 flex items-center gap-2 rounded-[var(--radius-medium)] bg-warning/10 p-2 text-warning">
                <WifiOff className="h-4 w-4" aria-hidden />
                <Text variant="caption" tone="secondary">
                  You're offline. Showing last known status.
                </Text>
              </div>
            )}
            {tracking.status === "error" && (
              <div className="mt-3 flex items-center gap-2 rounded-[var(--radius-medium)] bg-error/10 p-2 text-error">
                <AlertCircle className="h-4 w-4" aria-hidden />
                <Text variant="caption" tone="error">
                  {tracking.error}
                </Text>
              </div>
            )}
          </section>

          {/* Timeline */}
          <section
            aria-label="Order timeline"
            className="rounded-[var(--radius-large)] border border-divider bg-surface p-4"
          >
            <Text variant="titleLarge" className="mb-4">
              Timeline
            </Text>
            {snapshot ? (
              <OrderTimeline steps={snapshot.steps} cancelled={cancelled} />
            ) : (
              <div className="space-y-3">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-3/4" />
              </div>
            )}
          </section>

          {/* Fulfillment-specific panel */}
          <section className="rounded-[var(--radius-large)] border border-divider bg-surface p-4">
            <FulfillmentPanel order={order} etaMinutes={snapshot?.etaMinutes} />
          </section>

          <AppButton
            fullWidth
            variant="outlined"
            iconLeft={<Phone className="h-4 w-4" aria-hidden />}
            onClick={() => {
              if (order.store.phone && typeof window !== "undefined") {
                window.open(`tel:${order.store.phone}`, "_blank");
              }
            }}
          >
            Contact store
          </AppButton>

          <AppButton
            fullWidth
            variant="ghost"
            onClick={() => navigate({ to: "/orders/$orderId", params: { orderId: order.id } })}
          >
            View full details
          </AppButton>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}

function TrackSkeleton() {
  return (
    <AppShell title="Track order" backTo="/orders" showTabs={false} showTopBar>
      <div className="mx-auto max-w-[560px] space-y-3 px-4 py-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </AppShell>
  );
}
