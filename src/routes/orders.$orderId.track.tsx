import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RefreshCw, Receipt, ChevronDown, ChevronUp } from "lucide-react";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { AppShell } from "@/shared/layouts/AppShell";
import { Skeleton } from "@/shared/components/feedback/Skeleton";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { FailureState } from "@/shared/components/feedback/FailureState";
import { useHydrated } from "@/shared/hooks/useHydrated";
import { HapticService } from "@/core/services/haptics";
import { formatINR } from "@/core/utils/format";

import {
  orderRepository,
  useOrdersStore,
  selectOrderById,
  useOrderTracking,
  type Order,
} from "@/features/orders";
import {
  DeliveryStepTracker,
  LiveOrderMap,
  RiderContactCard,
  usePorterLiveTracking,
} from "@/features/tracking";

export const Route = createFileRoute("/orders/$orderId/track")({
  head: () => ({
    meta: [
      { title: "Track Order — Burgonomics" },
      { name: "description", content: "Current status of your Burgonomics order, refreshed from the store." },
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
  const [orderError, setOrderError] = React.useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = React.useState(false);

  const trackingHook = useOrderTracking(hydrated ? orderId : null);
  const trackingState = usePorterLiveTracking(order, trackingHook.snapshot);

  const loadOrder = React.useCallback(async () => {
    if (!hydrated) return;
    setLoadingOrder(true);
    setOrderError(null);
    try {
      const res = await orderRepository.getOrder(orderId);
      if (res.success) {
        setOrder(res.data);
      } else {
        // A backend/network failure is NOT "not found" — surface a retry.
        setOrderError(res.error.message);
      }
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "Could not load this order.");
    } finally {
      setLoadingOrder(false);
    }
  }, [hydrated, orderId]);

  React.useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void (async () => {
      setLoadingOrder(true);
      setOrderError(null);
      try {
        const res = await orderRepository.getOrder(orderId);
        if (cancelled) return;
        if (res.success) {
          setOrder(res.data);
        } else {
          setOrderError(res.error.message);
        }
      } catch (err) {
        if (cancelled) return;
        setOrderError(err instanceof Error ? err.message : "Could not load this order.");
      } finally {
        if (!cancelled) setLoadingOrder(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, orderId]);

  const handleRetry = React.useCallback(() => {
    void loadOrder();
    void trackingHook.refresh();
  }, [loadOrder, trackingHook.refresh]);

  React.useEffect(() => {
    if (!order || !trackingHook.snapshot) return;
    if (trackingHook.snapshot.status.code !== order.status.code) {
      setOrder({ ...order, status: trackingHook.snapshot.status });
    }
  }, [order, trackingHook.snapshot]);

  if (!hydrated || loadingOrder) return <TrackSkeleton />;

  // A backend/network failure loading the order is NOT "not found" — it
  // must surface a retry UI so the user can recover without leaving.
  if (orderError) {
    return (
      <ProtectedRoute>
        <AppShell title="Track order" backTo="/orders" showTabs={false} showTopBar>
          <FailureState
            title="Couldn't load this order"
            message={orderError}
            onRetry={() => void handleRetry()}
          />
        </AppShell>
      </ProtectedRoute>
    );
  }

  // Only a confirmed empty result (order genuinely does not exist) is a
  // real "not found" — never a network/backend failure.
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

  // Tracking subscription failed (network/backend) — surface a retry UI
  // instead of silently showing a stale or empty tracker.
  if (trackingHook.status === "error") {
    return (
      <ProtectedRoute>
        <AppShell title={`Order #${order.shortCode || order.id.slice(-6).toUpperCase()}`} backTo="/orders" showTabs={false} showTopBar>
          <FailureState
            title="Live tracking unavailable"
            message={trackingHook.error ?? "We couldn't refresh your order status."}
            onRetry={() => void handleRetry()}
          />
        </AppShell>
      </ProtectedRoute>
    );
  }

  // Real store phone from the order snapshot only — never a hardcoded
  // fallback number. Rider/support contact renders from backend data.
  const storePhone = order.store?.phone ?? null;
  const shortOrderNum = order.shortCode || order.id.slice(-6).toUpperCase();
  const addressText =
    order.address?.line1 ||
    order.address?.label ||
    "Delivery Destination";

  return (
    <ProtectedRoute>
      <AppShell
        title={`Order #${shortOrderNum}`}
        backTo="/orders"
        showTabs={false}
        showTopBar
        rightSlot={
          <button
            aria-label="Refresh status"
            onClick={() => void trackingHook.refresh()}
            className="flex h-10 w-10 items-center justify-center rounded-full text-text-primary hover:bg-bg-secondary cursor-pointer"
          >
            <RefreshCw
              className={`h-4.5 w-4.5 ${trackingHook.status === "refreshing" ? "animate-spin" : ""}`}
            />
          </button>
        }
      >
        <div className="mx-auto max-w-[540px] space-y-4 px-4 py-3 pb-16 select-none">
          {/* 1. 4-Stage Visual Progress Stepper (status-driven) */}
          <DeliveryStepTracker tracking={trackingState} />

          {/* 2. Route endpoints (live GPS not integrated — no fabricated map) */}
          <LiveOrderMap
            tracking={trackingState}
            storeName={order.store?.name || "Burgonomics Outlet"}
            customerAddressText={addressText}
          />

          {/* 3. Rider Contact Card & Support Escalation CTAs */}
          <RiderContactCard
            tracking={trackingState}
            storePhone={storePhone}
            onOpenSupport={() => void navigate({ to: "/support" })}
          />

          {/* 4. Expandable Itemized Invoice Accordion */}
          <div className="rounded-3xl border border-neutral-800 bg-[#0D0D0D] shadow-md overflow-hidden">
            <button
              type="button"
              onClick={() => {
                void HapticService.selection();
                setReceiptOpen(!receiptOpen);
              }}
              className="flex w-full items-center justify-between p-4 text-left hover:bg-neutral-900/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Receipt className="h-4.5 w-4.5 text-emerald-400" />
                <div>
                  <h3 className="font-sans text-xs font-black text-white">
                    View Itemized Tax Invoice
                  </h3>
                  <p className="text-[11px] text-neutral-400">
                    {order.items?.length ?? 1} Items • {formatINR(order.totals?.grandTotal ?? 0)}
                  </p>
                </div>
              </div>
              {receiptOpen ? (
                <ChevronUp className="h-4 w-4 text-neutral-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-neutral-400" />
              )}
            </button>

            {receiptOpen && (
              <div className="border-t border-neutral-800/80 p-4 space-y-3 bg-neutral-950/60">
                <div className="space-y-2">
                  {order.items?.map((item, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="font-medium text-neutral-300">
                        {item.quantity}x {item.name}
                      </span>
                      <span className="font-bold text-white">
                        {formatINR((item.unitPrice || 0) * (item.quantity || 1))}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-neutral-800 pt-2 space-y-1 text-[11px] text-neutral-400">
                  <div className="flex justify-between">
                    <span>GST & Taxes</span>
                    <span>{formatINR(order.totals?.taxes ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Packaging Charge</span>
                    <span>{formatINR(order.totals?.packingFee ?? 5)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Delivery Fee</span>
                    <span>{order.totals?.deliveryFee === 0 ? "FREE" : formatINR(order.totals?.deliveryFee ?? 0)}</span>
                  </div>
                  <div className="border-t border-neutral-800 pt-2 flex justify-between font-sans text-xs font-black text-white">
                    <span>Total Paid ({order.payment?.method?.toUpperCase() ?? "PAID"})</span>
                    <span className="text-emerald-400 font-mono text-sm">
                      {formatINR(order.totals?.grandTotal ?? 0)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}

function TrackSkeleton() {
  return (
    <AppShell title="Track Order" backTo="/orders" showTabs={false} showTopBar>
      <div className="mx-auto max-w-[540px] space-y-3 px-4 py-4">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-3xl" />
        <Skeleton className="h-28 w-full rounded-3xl" />
      </div>
    </AppShell>
  );
}

export default TrackOrderPage;
