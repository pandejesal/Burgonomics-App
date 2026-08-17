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
} from "lucide-react";

import { AppShell } from "@/shared/layouts/AppShell";
import { AppButton } from "@/shared/components/common/AppButton";
import { Text } from "@/shared/components/common/Text";
import { Skeleton } from "@/shared/components/feedback/Skeleton";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { toast } from "@/shared/components/feedback/AppToaster";
import { useHydrated } from "@/shared/hooks/useHydrated";
import { BrandMascot } from "@/shared/components/common/BrandMascot";

import { usePaymentStore } from "@/features/payments";
import {
  orderRepository,
  useOrdersStore,
  selectOrderById,
  OrderStatusBadge,
  OrderPriceSummary,
  type Order,
} from "@/features/orders";
import { ReviewItemsList } from "@/features/checkout";

/**
 * Order Confirmation — fetches the placed order through the repository.
 * All copy (status label, ETA, store, items, totals) is data-driven so
 * swapping the mock for `GET /v1/orders/:id` requires no UI change.
 */
export const Route = createFileRoute("/order-confirmation/$orderId")({
  head: () => ({
    meta: [
      { title: "Order confirmed — Burgonomics" },
      { name: "description", content: "Your order has been placed." },
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
  const resetPayment = usePaymentStore((s) => s.reset);

  React.useEffect(() => () => resetPayment(), [resetPayment]);

  React.useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void orderRepository.getOrder(orderId).then((res) => {
      if (cancelled) return;
      if (res.success) setOrder(res.data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, orderId]);

  if (!hydrated || loading) return <ConfirmationSkeleton />;

  if (!order) {
    return (
      <AppShell title="Order confirmed" showTabs={false} showTopBar>
        <EmptyState
          title="Order not found"
          description="We couldn't locate this order. It may have been removed."
          actionLabel="Back to home"
          onAction={() => navigate({ to: "/home" })}
        />
      </AppShell>
    );
  }

  const eta = order.estimatedAt
    ? Math.max(0, Math.round((+new Date(order.estimatedAt) - Date.now()) / 60_000))
    : undefined;
  const fulfillmentLabel =
    order.fulfillment === "delivery"
      ? "Delivery"
      : order.fulfillment === "takeaway"
        ? "Takeaway"
        : "Dine-in";

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
    <AppShell title="Order confirmed" showTabs={false} showTopBar={false}>
      <div className="mx-auto flex min-h-[100dvh] max-w-[560px] flex-col px-6 pb-8 pt-10">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="relative flex flex-col items-center">
            <BrandMascot size={120} float className="drop-shadow-[0_8px_16px_rgba(14,72,37,0.2)]" />
            <div className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-success text-white border-2 border-surface shadow-md">
              <CheckCircle2 className="h-5 w-5" aria-hidden />
            </div>
          </div>
          <div>
            <Text variant="headlineLarge" as="h1">
              Order placed!
            </Text>
            <Text variant="bodyMedium" tone="secondary" className="mt-2">
              Thanks for your order. We've sent it to the kitchen.
            </Text>
          </div>
        </div>

        {/* Order card */}
        <section
          aria-label="Order summary"
          className="mt-6 rounded-[var(--radius-large)] border border-divider bg-surface p-5"
        >
          <div className="flex items-center justify-between">
            <Text variant="caption" tone="secondary">
              Order number
            </Text>
            <OrderStatusBadge status={order.status} />
          </div>
          <Text variant="titleLarge" className="mt-1 tabular-nums">
            {order.shortCode}
          </Text>

          {/* Prominent Fulfillment Token / Table Standout */}
          {order.fulfillment === "takeaway" && (
            <div className="mt-3 rounded-2xl bg-primary/5 border border-dashed border-primary/40 p-3.5 flex items-center justify-between">
              <div>
                <span className="block text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                  Counter Pickup Token
                </span>
                <span className="font-mono text-xl font-black text-primary tracking-widest">
                  {order.shortCode.split("-").pop() || order.shortCode}
                </span>
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                Show at Counter
              </span>
            </div>
          )}

          {order.fulfillment === "dinein" && order.tableNumber && (
            <div className="mt-3 rounded-2xl bg-primary/5 border border-dashed border-primary/40 p-3.5 flex items-center justify-between">
              <div>
                <span className="block text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                  Dine-In Table
                </span>
                <span className="font-mono text-xl font-black text-primary">
                  Table {order.tableNumber}
                </span>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-600">
                KOT Dispatched
              </span>
            </div>
          )}

          <div className="mt-4 space-y-3 border-t border-divider pt-4">
            <MetaRow icon={<ShoppingBag className="h-4 w-4" aria-hidden />} label="Fulfillment">
              {fulfillmentLabel}
            </MetaRow>
            <MetaRow icon={<MapPin className="h-4 w-4" aria-hidden />} label="Store">
              <span className="block truncate">{order.store.name}</span>
              <Text variant="caption" tone="secondary" className="block truncate">
                {order.store.address}
              </Text>
            </MetaRow>
            {eta != null && !order.status.terminal && (
              <MetaRow
                icon={<Clock className="h-4 w-4" aria-hidden />}
                label={order.fulfillment === "delivery" ? "Estimated delivery" : "Ready in"}
              >
                {eta <= 0 ? "Any moment" : `~${eta} min`}
              </MetaRow>
            )}
            <MetaRow icon={<FileText className="h-4 w-4" aria-hidden />} label="Payment">
              {order.payment.label} ·{" "}
              {order.payment.status === "paid"
                ? "Paid"
                : order.payment.status === "CASH_PENDING"
                  ? "Cash Pending"
                  : order.payment.status === "PAY_AT_STORE"
                    ? "Pay at Store"
                    : order.payment.status}
            </MetaRow>
          </div>
        </section>

        {/* Items */}
        <section
          aria-label="Items"
          className="mt-4 rounded-[var(--radius-large)] border border-divider bg-surface p-5"
        >
          <Text variant="titleLarge" className="mb-3">
            Your order
          </Text>
          <ReviewItemsList lines={order.items} />
        </section>

        {/* Totals */}
        <section
          aria-label="Price summary"
          className="mt-4 rounded-[var(--radius-large)] border border-divider bg-surface p-5"
        >
          <Text variant="titleLarge" className="mb-3">
            Price summary
          </Text>
          <OrderPriceSummary totals={order.totals} promo={order.promo} />
        </section>

        {/* Contextual Push Notification Soft-Prompt */}
        <NotificationPromptCard />

        {/* Actions */}
        <div className="mt-6 flex flex-col gap-3">
          <AppButton
            fullWidth
            size="lg"
            iconLeft={<RouteIcon className="h-4 w-4" aria-hidden />}
            onClick={() =>
              navigate({ to: "/orders/$orderId/track", params: { orderId: order.id } })
            }
          >
            Track order
          </AppButton>
          <div className="grid grid-cols-2 gap-3">
            <AppButton
              variant="outlined"
              size="md"
              iconLeft={<Share2 className="h-4 w-4" aria-hidden />}
              onClick={() => void share()}
            >
              Share
            </AppButton>
            <AppButton
              variant="outlined"
              size="md"
              iconLeft={<FileText className="h-4 w-4" aria-hidden />}
              disabled
              title="Invoice will be available once the backend is connected."
            >
              Invoice
            </AppButton>
          </div>
          <Link
            to="/home"
            className="mt-1 inline-flex items-center justify-center gap-2 text-center type-label-large text-primary hover:underline"
          >
            <Home className="h-4 w-4" aria-hidden /> Back to home
          </Link>
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
        <Text variant="caption" tone="secondary">
          {label}
        </Text>
        <Text variant="titleMedium" as="div">
          {children}
        </Text>
      </div>
    </div>
  );
}

function NotificationPromptCard() {
  const [dismissed, setDismissed] = React.useState(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem("burg.push_prompted") === "true";
    }
    return false;
  });
  const [busy, setBusy] = React.useState(false);

  if (dismissed) return null;

  const onEnable = async () => {
    setBusy(true);
    try {
      const { requestPushPermissions } = await import("@/shared/platform/pushNotifications");
      const granted = await requestPushPermissions();
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem("burg.push_prompted", "true");
      }
      setDismissed(true);
      if (granted) {
        toast.success("Live order tracking notifications enabled!");
      }
    } catch {
      setDismissed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-[var(--radius-large)] border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Bell className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <Text variant="titleMedium" className="font-semibold text-text-primary">
            Get live status alerts
          </Text>
          <Text variant="bodySmall" tone="secondary" className="mt-0.5">
            Never miss an update when your burger is cooking or out for delivery.
          </Text>
          <div className="mt-3 flex items-center gap-2">
            <AppButton size="sm" variant="cta" onClick={() => void onEnable()} loading={busy}>
              Enable alerts
            </AppButton>
            <AppButton
              size="sm"
              variant="ghost"
              onClick={() => {
                setDismissed(true);
                if (typeof window !== "undefined" && window.localStorage) {
                  window.localStorage.setItem("burg.push_prompted", "true");
                }
              }}
            >
              Maybe later
            </AppButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmationSkeleton() {
  return (
    <AppShell title="Order confirmed" showTabs={false} showTopBar>
      <div className="mx-auto max-w-[560px] space-y-3 px-6 py-10">
        <Skeleton className="mx-auto h-24 w-24 rounded-full" />
        <Skeleton className="mx-auto h-6 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </AppShell>
  );
}
