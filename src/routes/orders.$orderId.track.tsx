import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  RefreshCw,
  Phone,
  MessageSquare,
  Receipt,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { AppShell } from "@/shared/layouts/AppShell";
import { Skeleton } from "@/shared/components/feedback/Skeleton";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { FailureState } from "@/shared/components/feedback/FailureState";
import { toUserMessage } from "@/core/errors/userMessages";
import { useHydrated } from "@/shared/hooks/useHydrated";
import { HapticService } from "@/core/services/haptics";
import { formatINR } from "@/core/utils/format";
import { isSafeTelNumber } from "@/shared/utils/urlSafety";
import { ordersService } from "@/features/orders/services/ordersService";
import { useStorePhone } from "@/features/orders/hooks/useStorePhone";

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
      {
        name: "description",
        content: "Track your Burgonomics order status, stages, and estimated time.",
      },
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
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);
  const [receiptOpen, setReceiptOpen] = React.useState(false);

  const trackingHook = useOrderTracking(hydrated ? orderId : null);
  const trackingState = usePorterLiveTracking(order);
  // Loop: no fabricated fallback — a missing store phone must hide the call
  // button, never dial a hardcoded number that isn't the restaurant.
  const storePhone = useStorePhone(order);

  React.useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void orderRepository
      .getOrder(orderId)
      .then((res) => {
        if (cancelled) return;
        // Preserve the cached order on ok(null): a genuine miss must not wipe
        // the just-placed order. A READ FAILURE is different: never render it
        // as "Order not found" — say the load failed and offer a retry.
        if (res.success) {
          if (res.data) setOrder(res.data);
        } else {
          setLoadError(toUserMessage(res));
        }
        setLoadingOrder(false);
      })
      .catch(() => {
        // Rejection must end loading — otherwise the skeleton spins forever.
        if (!cancelled) {
          setLoadError("We couldn't load this order. Please try again.");
          setLoadingOrder(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, orderId, reloadToken]);

  React.useEffect(() => {
    if (!order || !trackingHook.snapshot) return;
    if (trackingHook.snapshot.status.code !== order.status.code) {
      setOrder({ ...order, status: trackingHook.snapshot.status });
    }
  }, [order, trackingHook.snapshot]);

  if (!hydrated || loadingOrder) return <TrackSkeleton />;

  // A failed read is not an absent order. The customer gets the real reason
  // and a retry instead of a false "Order not found".
  if (loadError && !order) {
    return (
      <ProtectedRoute>
        <AppShell title="Track order" backTo="/orders" showTabs={false} showTopBar>
          <FailureState
            title="Couldn't load this order"
            message={loadError}
            onRetry={() => {
              setLoadError(null);
              setLoadingOrder(true);
              setReloadToken((value) => value + 1);
            }}
          />
        </AppShell>
      </ProtectedRoute>
    );
  }

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

  // Developer simulation handler to advance status
  const handleDevAdvanceStatus = () => {
    void HapticService.impact("medium");
    const statusSequence = [
      { code: "ORDER_PLACED", label: "Order Placed & Confirmed" },
      { code: "KITCHEN_PREPARING", label: "Grilling in Kitchen" },
      { code: "OUT_FOR_DELIVERY", label: "Out for Delivery" },
      { code: "DELIVERED", label: "Delivered & Enjoyed" },
    ];
    const currentIndex = statusSequence.findIndex((s) => s.code === order.status.code);
    const nextIndex = (currentIndex + 1) % statusSequence.length;
    const nextStatus = statusSequence[nextIndex];

    setOrder({
      ...order,
      status: {
        ...order.status,
        code: nextStatus.code,
        label: nextStatus.label,
      },
    });
  };

  const shortOrderNum = order.shortCode || order.id.slice(-6).toUpperCase();
  const addressText = order.address?.line1 || order.address?.label || "Delivery Destination";

  // Real outlet + destination coordinates only — no default store/drop
  // coordinates. Without them the map is replaced by an honest caption.
  const storeCoords = trackingState.storeLocation;
  const dropCoords = trackingState.dropLocation;
  const hasRouteCoords =
    storeCoords != null &&
    Number.isFinite(storeCoords.lat) &&
    Number.isFinite(storeCoords.lng) &&
    dropCoords != null &&
    Number.isFinite(dropCoords.lat) &&
    Number.isFinite(dropCoords.lng);

  // Row renders only for a fee the order actually recorded — never a default.
  const packingFee = order.totals?.packingFee;

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
            className="flex h-11 w-11 items-center justify-center rounded-full text-text-primary hover:bg-bg-secondary cursor-pointer"
          >
            <RefreshCw
              className={`h-4.5 w-4.5 ${trackingHook.status === "refreshing" ? "animate-spin" : ""}`}
              aria-hidden
            />
          </button>
        }
      >
        <div className="mx-auto max-w-[540px] space-y-5 px-4 pb-16 pt-4 select-none">
          {/* Live-update health: a failing poll used to render nowhere, so the
              page silently showed stale stages. A paused state keeps the last
              known truth visible without inventing a status update. */}
          {(trackingHook.status === "error" || trackingHook.status === "offline") && (
            <div
              data-testid="tracking-pause-banner"
              role="status"
              className="flex items-center gap-3 rounded-2xl border border-divider bg-surface p-4"
            >
              <p className="flex-1 text-sm leading-relaxed text-text-secondary">
                {trackingHook.status === "offline"
                  ? "You're offline — live updates are paused. Showing the last known status."
                  : trackingHook.snapshot
                    ? "Live updates are having trouble — showing the last known status."
                    : (trackingHook.error ?? "Live status is unavailable right now.")}
              </p>
              {trackingHook.snapshot && (
                <button
                  type="button"
                  onClick={() => void trackingHook.refresh()}
                  className="min-h-11 shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground cursor-pointer hover:bg-primary-hover"
                >
                  Retry
                </button>
              )}
            </div>
          )}
          {/* 1. 4-Stage Visual Progress Stepper */}
          <DeliveryStepTracker
            tracking={trackingState}
            // Loop: the sandbox stepper fakes Delivered locally with no server
            // write — DEV-only. Prod customers must never self-advance status.
            onAdvanceDevStatus={import.meta.env.DEV ? handleDevAdvanceStatus : undefined}
          />

          {/* 2. Live route map — real outlet + destination coordinates only.
              Otherwise the stage diagram above stands alone with an honest caption. */}
          {hasRouteCoords ? (
            <LiveOrderMap
              tracking={trackingState}
              storeName={order.store?.name || "Burgonomics Outlet"}
              customerAddressText={addressText}
            />
          ) : (
            <div className="space-y-1.5 rounded-3xl border border-divider bg-surface p-6 text-center shadow-md">
              <p className="type-title-large text-text">Live location unavailable</p>
              <p className="text-sm leading-relaxed text-text-secondary">
                {trackingState.isTakeawayOrDineIn
                  ? "The map appears once outlet coordinates are confirmed."
                  : "The map appears once outlet and delivery coordinates are confirmed."}
              </p>
            </div>
          )}

          {/* 3. Rider Contact Card & Support Escalation CTAs */}
          <RiderContactCard
            tracking={trackingState}
            storePhone={storePhone}
            onOpenSupport={() => void navigate({ to: "/support" })}
          />

          {/* 3b. Payment truth outranks the staged kitchen timeline (CUS-16).
              An unpaid online order never reaches the kitchen, so the grace
              card (which says the kitchen has it) must not render. */}
          {trackingState.paymentState === "unpaid" ||
          trackingState.paymentState === "confirming" ? (
            <UnpaidOrderCard
              order={order}
              paymentState={trackingState.paymentState}
              onOrderCancelled={setOrder}
            />
          ) : (
            // 60-second cancellation grace — self-serve before the kitchen starts
            <CancellationGraceCard order={order} onOrderCancelled={setOrder} />
          )}

          {/* 4. Expandable Order Receipt Accordion. This is the customer-facing
              receipt, not a GST tax invoice (the real invoice is generated by
              InvoiceDownloadButton). Legacy docs may carry no item lines, which
              must read as 0 Items, not as a fabricated 1. */}
          <div className="rounded-3xl border border-divider bg-surface shadow-md overflow-hidden">
            <button
              type="button"
              onClick={() => {
                void HapticService.selection();
                setReceiptOpen(!receiptOpen);
              }}
              className="flex min-h-11 w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-bg-secondary cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Receipt className="h-4.5 w-4.5 shrink-0 text-primary-text" aria-hidden />
                <div className="min-w-0">
                  <h3 className="type-title-large text-text">View Order Receipt</h3>
                  <p className="text-sm leading-relaxed text-text-secondary tabular-nums">
                    {order.items?.length ?? 0} {(order.items?.length ?? 0) === 1 ? "Item" : "Items"}{" "}
                    • {formatINR(order.totals?.grandTotal ?? 0)}
                  </p>
                </div>
              </div>
              {receiptOpen ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
              )}
            </button>

            {receiptOpen && (
              <div className="space-y-4 border-t border-divider bg-bg-secondary/40 p-4">
                <div className="space-y-2.5">
                  {order.items?.map((item, i) => (
                    <div key={i} className="flex justify-between gap-3 text-sm">
                      <span className="font-medium text-text">
                        {item.quantity}x {item.name}
                      </span>
                      <span className="font-semibold tabular-nums text-text">
                        {formatINR((item.unitPrice || 0) * (item.quantity || 1))}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 border-t border-divider pt-3 text-sm text-text-secondary">
                  <div className="flex justify-between gap-3">
                    <span>Incl. GST (5%)</span>
                    <span className="tabular-nums">{formatINR(order.totals?.taxes ?? 0)}</span>
                  </div>
                  {packingFee != null && (
                    <div className="flex justify-between gap-3">
                      <span>Packaging charge</span>
                      <span className="tabular-nums">{formatINR(packingFee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <span>Delivery fee</span>
                    <span className="tabular-nums">
                      {formatINR(order.totals?.deliveryFee ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-divider pt-3 text-base font-semibold text-text">
                    <span>
                      {trackingState.paymentState === "unpaid"
                        ? `Order total (${order.payment?.method?.toUpperCase() ?? "ONLINE"})`
                        : `Total Paid (${order.payment?.method?.toUpperCase() ?? "PAID"})`}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-success">
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

// -- Unpaid / confirming payment ------------------------------------

/**
 * CUS-16. The order document exists before Razorpay opens, so closing the
 * sheet leaves an unpaid online order. This card states that plainly and
 * offers the two real paths: finish the payment, or cancel the order. It
 * reuses the existing payment route and `ordersService.cancelOrder`; nothing
 * is invented and no status is written here beyond the server's cancel.
 */
function UnpaidOrderCard({
  order,
  paymentState,
  onOrderCancelled,
}: {
  order: Order;
  paymentState: "unpaid" | "confirming";
  onOrderCancelled?: (order: Order) => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = React.useState(false);

  const handleCancel = async () => {
    if (!window.confirm("Cancel this unpaid order?")) return;
    setBusy(true);
    const res = await ordersService.cancelOrder(order.id);
    setBusy(false);
    if (res.success && res.data) {
      useOrdersStore.getState().upsert(res.data);
      onOrderCancelled?.(res.data);
      toast.success("Order cancelled.");
    } else {
      const message = !res.success ? res.error.message : undefined;
      toast.error(message || "We couldn't cancel this order. Please try again.");
    }
  };

  return (
    <div
      data-testid="unpaid-order-card"
      className="space-y-4 rounded-3xl border border-warning/40 bg-warning/10 p-5 shadow-md"
    >
      <div className="space-y-1">
        <h3 className="type-title-large text-text">
          {paymentState === "confirming" ? "Confirming payment" : "Payment not completed"}
        </h3>
        <p className="text-sm leading-relaxed text-text-secondary">
          {paymentState === "confirming"
            ? "We're confirming your payment with the bank. This usually takes a few seconds — please don't pay again. The kitchen starts only after payment is confirmed."
            : "This order has not been paid, so the kitchen has not received it. Complete the payment to send it, or cancel the order."}
        </p>
      </div>

      {paymentState === "unpaid" && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Link
            to="/payment"
            search={{ orderId: order.id }}
            className="flex min-h-11 items-center justify-center rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Complete payment
          </Link>
          <button
            type="button"
            data-testid="cancel-unpaid-order"
            onClick={() => void handleCancel()}
            disabled={busy}
            className="flex min-h-11 items-center justify-center rounded-xl border border-divider bg-surface px-3 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-bg-secondary disabled:opacity-50"
          >
            {busy ? "Cancelling…" : "Cancel order"}
          </button>
        </div>
      )}
    </div>
  );
}

// -- 60-second cancellation grace -----------------------------------

/** Statuses that may still be cancelled by the customer themselves. */
const CANCELLABLE_STATUS_CODES = new Set(["PLACED", "ORDER_PLACED", "PENDING", "CONFIRMED"]);
/** Statuses where only the store can still cancel (kitchen accepted / prepping). */
const CALL_STORE_STATUS_CODES = new Set([
  ...CANCELLABLE_STATUS_CODES,
  "ACCEPTED",
  "PREPARING",
  "KITCHEN_PREPARING",
]);

/** Burgonomics WhatsApp support line (click-to-chat). */
const WHATSAPP_SUPPORT_HREF = "https://wa.me/917878848480";

interface CancellationGraceCardProps {
  order: Order;
  /** Route reloads its state with the cancelled order the service returns. */
  onOrderCancelled?: (order: Order) => void;
}

/**
 * Cancellation grace card rendered beneath the tracker.
 *
 * For the first 60 seconds after placement the customer can cancel the order
 * themselves (instant full refund). The countdown is measured from the real
 * placement timestamp — never a synthetic in-memory timer — and once it closes
 * (or the kitchen accepts / starts prepping) the only honest affordance left
 * is contacting the store.
 */
export function CancellationGraceCard({ order, onOrderCancelled }: CancellationGraceCardProps) {
  const storePhone = useStorePhone(order);
  // Live countdown: re-render every second while the card is mounted.
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const placedAtIso = order.placedAt || (order as Order & { createdAt?: string }).createdAt || "";
  const placedAtMs = new Date(placedAtIso).getTime();
  // A missing / unparsable placement timestamp must never grant an
  // unverifiable grace window — it lands in the call-the-store branch.
  const elapsed = Number.isFinite(placedAtMs)
    ? Math.floor((Date.now() - placedAtMs) / 1000)
    : Number.MAX_SAFE_INTEGER;
  const remainingSec = Math.max(0, 60 - elapsed);

  const statusCode = order.status.code.toUpperCase();
  const inGrace = CANCELLABLE_STATUS_CODES.has(statusCode) && remainingSec > 0;
  const showCallStore = !inGrace && CALL_STORE_STATUS_CODES.has(statusCode);

  // Delivered / cancelled / out-for-delivery orders render no cancel UI.
  if (!inGrace && !showCallStore) return null;

  // Loop: staff-entered store phones must never become one-tap dial links.
  const safeStorePhone = storePhone && isSafeTelNumber(storePhone) ? storePhone : undefined;

  // MT-08: dual support gateway. The WhatsApp click-to-chat link is prefilled
  // with this order so the store knows what the customer is writing about —
  // and an in-app support ticket sits right beside it for customers who would
  // rather not leave the app (no phone number required at all).
  // `orderNumber` is the store-issued number when the backend sends one; the
  // short code is what this page already shows as "#…"; the raw id is the
  // honest last resort — never an invented label.
  const explicitOrderNumber = (order as Order & { orderNumber?: string }).orderNumber;
  const orderIdLabel = explicitOrderNumber
    ? `#${explicitOrderNumber}`
    : order.shortCode
      ? `#${order.shortCode}`
      : order.id;
  const whatsappUrl = `${WHATSAPP_SUPPORT_HREF}?text=${encodeURIComponent(
    `Hello Burgonomics, I need help with order ${orderIdLabel}`,
  )}`;

  const handleCancel = async () => {
    // Honest copy: the client only flips the order status (no refund call
    // exists anywhere client-side), so promising an "instant full refund" was
    // a promise with no mechanism — refund handling is the store's policy,
    // applied outside the app.
    if (!window.confirm("Cancel this order?")) return;
    const res = await ordersService.cancelOrder(order.id);
    if (res.success && res.data) {
      // Keep the orders store coherent with the CANCELLED doc the service
      // just persisted, then reload the route state.
      useOrdersStore.getState().upsert(res.data);
      onOrderCancelled?.(res.data);
      toast.success(
        res.data.payment?.status === "refunded"
          ? "Order cancelled. Your refund has been initiated."
          : "Order cancelled.",
      );
    } else {
      // `res.success && res.data` leaves ApiSuccess<null> in the else branch,
      // so the failure message must be read behind an explicit !success check.
      const failureMessage = !res.success ? res.error.message : undefined;
      toast.error(failureMessage || "We couldn't cancel this order. Please call the store.");
    }
  };

  if (inGrace) {
    return (
      <div
        data-testid="cancellation-grace-card"
        className="space-y-4 rounded-3xl border border-divider bg-surface p-5 shadow-md"
      >
        <div className="flex items-center gap-3">
          <span className="rounded-2xl bg-warning/10 p-2 text-warning">
            <Clock className="h-4 w-4 animate-pulse" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="type-title-large text-text">
              Cancellation Grace Period: {remainingSec}s remaining
            </h3>
            <p className="text-sm leading-relaxed text-text-secondary">
              Cancel free of charge before the kitchen starts grilling.
            </p>
          </div>
        </div>

        {/* Countdown bar — width mirrors the real seconds left, never a fake ease. */}
        <div
          role="progressbar"
          aria-label="Cancellation grace period"
          aria-valuemin={0}
          aria-valuemax={60}
          aria-valuenow={remainingSec}
          className="h-1.5 w-full overflow-hidden rounded-full bg-bg-secondary"
        >
          <div
            className="h-full rounded-full bg-warning transition-all duration-1000 ease-linear"
            style={{ width: `${(remainingSec / 60) * 100}%` }}
          />
        </div>

        <button
          type="button"
          data-testid="cancel-order-button"
          onClick={() => void handleCancel()}
          className="min-h-11 w-full rounded-xl border border-divider bg-bg-secondary py-2.5 text-sm font-semibold text-text transition-colors hover:bg-surface cursor-pointer"
        >
          Cancel Order
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="grace-expired-card"
      className="space-y-4 rounded-3xl border border-divider bg-surface p-5 shadow-md"
    >
      <div className="flex items-center gap-3">
        <span className="rounded-2xl bg-bg-secondary p-2 text-text-secondary">
          <Clock className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="type-title-large text-text">Cancellation window closed</h3>
          <p className="text-sm leading-relaxed text-text-secondary">
            The kitchen has your order — the store can still help with changes or a cancellation.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {safeStorePhone ? (
          <a
            href={`tel:${safeStorePhone}`}
            data-testid="call-store-link"
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-bg-secondary px-2 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-surface"
          >
            <Phone className="h-3.5 w-3.5 shrink-0 text-primary-text" aria-hidden />
            <span>Need changes? Call Store</span>
          </a>
        ) : (
          <span className="self-center text-sm italic text-text-secondary">
            Store phone unavailable
          </span>
        )}

        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer noopener"
          data-testid="whatsapp-support-link"
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-2 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>WhatsApp Support</span>
        </a>

        {/* MT-08: in-app alternative — same escalation, no chat app needed. */}
        <Link
          to="/support"
          search={{ topic: "order", orderId: order.id }}
          data-testid="raise-ticket-link"
          className="col-span-2 flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-divider bg-bg-secondary px-2 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-surface"
        >
          <FileText className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
          <span>Raise Support Ticket</span>
        </Link>
      </div>
    </div>
  );
}

function TrackSkeleton() {
  return (
    <AppShell title="Track Order" backTo="/orders" showTabs={false} showTopBar>
      <div className="mx-auto max-w-[540px] space-y-4 px-4 py-4">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-3xl" />
        <Skeleton className="h-28 w-full rounded-3xl" />
      </div>
    </AppShell>
  );
}

export default TrackOrderPage;
