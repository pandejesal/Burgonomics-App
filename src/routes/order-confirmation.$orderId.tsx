import * as React from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  Clock,
  MapPin,
  ShoppingBag,
  Route as RouteIcon,
  Share2,
  FileText,
  Home,
  Bell,
  MessageSquare,
  Sparkles,
  HelpCircle,
  ArrowRight,
} from "lucide-react";

import { AppShell } from "@/shared/layouts/AppShell";
import { AppButton } from "@/shared/components/common/AppButton";
import { Text } from "@/shared/components/common/Text";
import { Skeleton } from "@/shared/components/feedback/Skeleton";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { toast } from "@/shared/components/feedback/AppToaster";
import { useHydrated } from "@/shared/hooks/useHydrated";
import { HapticService } from "@/core/services/haptics";
import { cartRepository } from "@/features/cart";
import { usePaymentStore } from "@/features/payments";
import {
  orderRepository,
  useOrdersStore,
  selectOrderById,
  OrderStatusBadge,
  OrderPriceSummary,
  OrderSuccessCelebration,
  EstimatedDeliveryCountdown,
  type Order,
} from "@/features/orders";
import { GrillCoinsEarnedCard } from "@/features/loyalty/components/GrillCoinsEarnedCard";
import { useLoyaltyStore } from "@/features/loyalty/state/loyaltyStore";
import { ReviewItemsList } from "@/features/checkout";
import { db } from "@/core/config/firebase";
import { doc, onSnapshot } from "firebase/firestore";

export const Route = createFileRoute("/order-confirmation/$orderId")({
  head: () => ({
    meta: [
      { title: "Order Confirmed — Burgonomics (100% Pure Veg)" },
      { name: "description", content: "Your delicious 100% Pure Veg burgers are being prepared fresh." },
    ],
  }),
  component: OrderConfirmationPage,
});

function OrderConfirmationPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const cachedOrder = useOrdersStore(selectOrderById(orderId));

  const [order, setOrder] = React.useState<Order | null>(cachedOrder);
  const [loading, setLoading] = React.useState(!cachedOrder);
  const [whatsappOptIn, setWhatsappOptIn] = React.useState(true);
  const resetPayment = usePaymentStore((s) => s.reset);

  // Guarantee cart is cleared and payment state is reset on arrival
  React.useEffect(() => {
    void cartRepository.clear();
    resetPayment();
    void HapticService.notification("success");
  }, [resetPayment]);

  // Real-time Firestore snapshot subscription with fallback to repository
  React.useEffect(() => {
    if (!hydrated) return;

    let unsub: (() => void) | null = null;
    let cancelled = false;

    // 1. Initial fetch via repository
    void orderRepository.getOrder(orderId).then((res) => {
      if (cancelled) return;
      if (res.success) setOrder(res.data);
      setLoading(false);
    });

    // 2. Real-time Firestore document listener if db is initialized
    try {
      if (db) {
        const orderDocRef = doc(db, "orders", orderId);
        unsub = onSnapshot(
          orderDocRef,
          (docSnap) => {
            if (docSnap.exists() && !cancelled) {
              const liveData = docSnap.data();
              setOrder((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  status: liveData.status ? { ...prev.status, ...liveData.status } : prev.status,
                  payment: liveData.payment ? { ...prev.payment, ...liveData.payment } : prev.payment,
                };
              });
            }
          },
          (err) => {
            console.warn("[Firestore onSnapshot] Order listener fell back to cached data:", err);
          }
        );
      }
    } catch {
      // Offline or mock mode fallback
    }

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [hydrated, orderId]);

  if (!hydrated || loading) return <ConfirmationSkeleton />;

  if (!order) {
    return (
      <AppShell title="Order Confirmed" showTabs={false} showTopBar>
        <EmptyState
          title="Order Not Found"
          description="We couldn't locate this order. It may have been archived or removed."
          actionLabel="Back to Home"
          onAction={() => navigate({ to: "/home" })}
        />
      </AppShell>
    );
  }

  const eta = order.estimatedAt
    ? Math.max(0, Math.round((+new Date(order.estimatedAt) - Date.now()) / 60_000))
    : 25;

  const fulfillmentLabel =
    order.fulfillment === "delivery"
      ? "Delivery"
      : order.fulfillment === "takeaway"
        ? "Takeaway"
        : "Dine-in";

  // Loyalty Points earn: 5% of item subtotal, min 15 pts, 1 pt = Rs.1
  const earnedCoins = Math.max(15, Math.round((order.totals.subtotal || 300) * 0.05));

  // Credit points once per order
  const creditedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!order || creditedRef.current === order.id) return;
    creditedRef.current = order.id;
    useLoyaltyStore.getState().earn(earnedCoins);
  }, [order, earnedCoins]);

  const shareOrder = async () => {
    const res = await orderRepository.buildShareMessage(order.id);
    if (!res.success) return;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title: res.data.title,
          text: res.data.text,
        });
      } catch {
        /* user dismissed share dialog */
      }
    } else {
      toast.success("Order link copied to clipboard!");
    }
  };

  return (
    <AppShell title="Order Confirmed" showTabs={false} showTopBar={false}>
      <div className="mx-auto flex min-h-[100dvh] max-w-[560px] flex-col px-4 sm:px-6 pb-12 pt-8 space-y-5">
        {/* 1. Celebratory Animation & Mascot */}
        <OrderSuccessCelebration orderNumber={order.shortCode} />

        {/* 2. Real-Time Makeline & Delivery Countdown */}
        <EstimatedDeliveryCountdown
          fulfillment={order.fulfillment}
          status={order.status}
          estimatedMinutes={eta}
        />

        {/* 3. Loyalty Points Earned Card */}
        <GrillCoinsEarnedCard pointsEarned={earnedCoins} totalSubtotal={order.totals.subtotal} />

        {/* 4. Order & Fulfillment Summary Card */}
        <section
          aria-label="Order Details"
          className="rounded-2xl border border-divider bg-surface p-4 sm:p-5 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between border-b border-divider pb-3">
            <div>
              <span className="text-[10px] uppercase font-bold text-text-secondary">Order Number</span>
              <p className="font-mono text-base font-black text-text">{order.shortCode}</p>
            </div>
            <OrderStatusBadge status={order.status} />
          </div>

          {/* Takeaway Pickup Token Banner */}
          {order.fulfillment === "takeaway" && (
            <div className="rounded-2xl bg-[#0E4825]/10 border border-[#0E4825]/25 p-3.5 flex items-center justify-between">
              <div>
                <span className="block text-[10px] font-black uppercase tracking-wider text-[#0E4825] dark:text-[#4ADE80]">
                  Counter Pickup Token
                </span>
                <span className="font-mono text-xl font-black text-[#0E4825] dark:text-[#4ADE80]">
                  {order.shortCode.split("-").pop() || order.shortCode}
                </span>
              </div>
              <span className="rounded-full bg-[#0E4825] text-white px-3 py-1 text-xs font-bold shadow-xs">
                Show at Counter
              </span>
            </div>
          )}

          {/* Dine-In Table Banner */}
          {order.fulfillment === "dinein" && order.tableNumber && (
            <div className="rounded-2xl bg-[#0E4825]/10 border border-[#0E4825]/25 p-3.5 flex items-center justify-between">
              <div>
                <span className="block text-[10px] font-black uppercase tracking-wider text-[#0E4825] dark:text-[#4ADE80]">
                  Dine-In Table
                </span>
                <span className="font-mono text-xl font-black text-[#0E4825] dark:text-[#4ADE80]">
                  Table {order.tableNumber}
                </span>
              </div>
              <span className="rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-3 py-1 text-xs font-bold">
                KOT Dispatched ✓
              </span>
            </div>
          )}

          <div className="space-y-3 pt-1 text-xs">
            <MetaRow icon={<ShoppingBag className="h-4 w-4" />} label="Fulfillment Mode">
              {fulfillmentLabel}
            </MetaRow>

            <MetaRow icon={<MapPin className="h-4 w-4" />} label="Branch Outlet">
              <span className="block font-bold text-text truncate">{order.store.name}</span>
              <span className="block text-text-secondary truncate">{order.store.address}</span>
            </MetaRow>

            <MetaRow icon={<FileText className="h-4 w-4" />} label="Payment Status">
              <span className="font-bold text-text">
                {order.payment.label} ·{" "}
                {order.payment.status === "paid"
                  ? "Paid ✓"
                  : order.payment.status === "CASH_PENDING"
                  ? "Cash on Delivery (Pending)"
                  : order.payment.status === "PAY_AT_STORE"
                  ? "Pay at Counter"
                  : order.payment.status}
              </span>
            </MetaRow>
          </div>
        </section>

        {/* 5. Itemized Order Review */}
        <section
          aria-label="Ordered Items"
          className="rounded-2xl border border-divider bg-surface p-4 sm:p-5 shadow-xs space-y-3"
        >
          <h3 className="text-xs font-bold uppercase tracking-wider text-text">
            Your Ordered Items ({order.items.length} {order.items.length === 1 ? "Item" : "Items"})
          </h3>
          <ReviewItemsList lines={order.items} />
        </section>

        {/* 6. Bill Summary Breakdown */}
        <section
          aria-label="Bill Breakdown"
          className="rounded-2xl border border-divider bg-surface p-4 sm:p-5 shadow-xs space-y-3"
        >
          <h3 className="text-xs font-bold uppercase tracking-wider text-text">
            Price Breakdown
          </h3>
          <OrderPriceSummary totals={order.totals} promo={order.promo} />
        </section>

        {/* 7. WhatsApp Updates Toggle */}
        <section className="rounded-2xl border border-divider bg-surface p-4 shadow-xs flex items-center justify-between gap-3 select-none">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-text">Send updates via WhatsApp</p>
              <p className="text-[11px] text-text-secondary">
                Receive live order alerts on your verified mobile number
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              void HapticService.selection();
              setWhatsappOptIn(!whatsappOptIn);
              toast.success(
                whatsappOptIn
                  ? "WhatsApp updates turned off"
                  : "WhatsApp tracking updates enabled!"
              );
            }}
            className={`w-11 h-6 rounded-full transition-colors flex items-center p-1 cursor-pointer ${
              whatsappOptIn ? "bg-[#0E4825]" : "bg-neutral-300 dark:bg-neutral-700"
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                whatsappOptIn ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </section>

        {/* 8. Primary Track Order & Navigation CTAs */}
        <div className="space-y-2.5 pt-2">
          <button
            type="button"
            onClick={() => {
              void HapticService.impact("medium");
              void navigate({ to: "/orders/$orderId/track", params: { orderId: order.id } });
            }}
            className="w-full py-4 px-6 min-h-[50px] rounded-2xl bg-[#FF6600] hover:bg-[#e05a00] text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all cursor-pointer"
          >
            <RouteIcon className="w-5 h-5 stroke-[2.5px]" />
            <span>Track Your Order Live →</span>
          </button>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => void shareOrder()}
              className="py-3 px-4 min-h-[44px] rounded-xl border border-divider bg-surface hover:border-primary text-text font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Share2 className="w-4 h-4" />
              <span>Share Order</span>
            </button>

            <Link
              to="/support"
              search={{ orderId: order.id }}
              className="py-3 px-4 min-h-[44px] rounded-xl border border-divider bg-surface hover:border-primary text-text font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Need Help?</span>
            </Link>
          </div>

          <div className="pt-2 text-center">
            <Link
              to="/home"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
            >
              <Home className="w-4 h-4" />
              <span>Back to Home</span>
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function MetaRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-text-secondary">{icon}</span>
      <div className="min-w-0 flex-1">
        <span className="text-[10px] uppercase font-bold text-text-secondary block">
          {label}
        </span>
        <div className="text-xs font-medium text-text mt-0.5">{children}</div>
      </div>
    </div>
  );
}

function ConfirmationSkeleton() {
  return (
    <AppShell title="Order Confirmed" showTabs={false} showTopBar={false}>
      <div className="mx-auto max-w-[560px] space-y-4 px-6 py-10">
        <Skeleton className="mx-auto h-28 w-28 rounded-full" />
        <Skeleton className="mx-auto h-6 w-48 rounded-xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-14 w-full rounded-2xl" />
      </div>
    </AppShell>
  );
}

export default OrderConfirmationPage;
