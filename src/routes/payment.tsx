import * as React from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import {
  MapPin,
  Clock,
  ShieldAlert,
  RotateCcw,
  ArrowLeft,
  Lock,
  FileText,
  Tag,
  Store,
  Notebook,
  Coins,
  CreditCard,
  Banknote,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCcw,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { AppShell } from "@/shared/layouts/AppShell";
import { AppButton } from "@/shared/components/common/AppButton";
import { AppBadge } from "@/shared/components/common/AppBadge";
import { Text } from "@/shared/components/common/Text";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { AudioService } from "@/core/services/audio";
import { Skeleton } from "@/shared/components/feedback/Skeleton";
import { Spinner } from "@/shared/components/feedback/Spinner";
import { useHydrated } from "@/shared/hooks/useHydrated";
import { formatINR } from "@/core/utils/format";
import { logger } from "@/core/logging/logger";
import { toast } from "@/shared/components/feedback/AppToaster";
import { HapticService } from "@/core/services/haptics";

import { useCartStore, selectItemCount, cartRepository } from "@/features/cart";
import { ReviewItemsList, useCheckoutStore } from "@/features/checkout";
import type { CartTotals } from "@/features/cart/models";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useAuthStore, selectIsAuthenticated } from "@/features/auth/state/authStore";
import { useAddressStore, selectSelectedAddress } from "@/features/addresses";
import {
  paymentRepository,
  usePaymentStore,
  razorpayAdapter,
  PaymentMethodList,
  SecurePaymentBadge,
  RazorpayModalHandler,
} from "@/features/payments";
import type { PaymentResult } from "@/features/payments/models";
import { orderRepository, type PaymentDisplayStatus } from "@/features/orders";

export const Route = createFileRoute("/payment")({
  head: () => ({
    meta: [
      { title: "Payment — Burgonomics" },
      { name: "description", content: "Complete your Burgonomics order securely." },
    ],
  }),
  component: PaymentPage,
});

function PaymentPage() {
  const navigate = useNavigate();
  const hydrated = useHydrated();

  const lines = useCartStore((s) => s.lines);
  const promo = useCartStore((s) => s.promo);
  const itemCount = useCartStore(selectItemCount);
  const activeStore = useStoreSelection((s) => s.activeStore);
  const fulfillment = useStoreSelection((s) => s.fulfillment);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isBootstrapped = useAuthStore((s) => s.isBootstrapped);
  const user = useAuthStore((s) => s.user);

  const status = usePaymentStore((s) => s.status);
  const method = usePaymentStore((s) => s.method);
  const order = usePaymentStore((s) => s.order);
  const failure = usePaymentStore((s) => s.failure);
  const setStatus = usePaymentStore((s) => s.setStatus);
  const setMethod = usePaymentStore((s) => s.setMethod);
  const setOrder = usePaymentStore((s) => s.setOrder);
  const setFailure = usePaymentStore((s) => s.setFailure);
  const setVerification = usePaymentStore((s) => s.setVerification);
  const resetPayment = usePaymentStore((s) => s.reset);

  const selectedAddress = useAddressStore(selectSelectedAddress);
  const orderNotes = useCheckoutStore((s) => s.orderNotes);
  const deliveryInstructions = useCheckoutStore((s) => s.deliveryInstructions);
  const pickupInstructions = useCheckoutStore((s) => s.pickupInstructions);
  const diningNotes = useCheckoutStore((s) => s.diningNotes);

  const [totals, setTotals] = React.useState<CartTotals | null>(null);
  const [preflightIssue, setPreflightIssue] = React.useState<string | null>(null);
  const [abandonmentOpen, setAbandonmentOpen] = React.useState(false);

  // Auth guard — send guests to login with return-to-payment.
  React.useEffect(() => {
    if (!hydrated || !isBootstrapped) return;
    if (!isAuthenticated) {
      void navigate({
        to: "/auth/login",
        replace: true,
        search: { redirect: "/payment" },
      });
    }
  }, [hydrated, isBootstrapped, isAuthenticated, navigate]);

  // Reset residual state on entry so the UI doesn't show a stale success/fail.
  React.useEffect(() => {
    resetPayment();
    return () => {
      const s = usePaymentStore.getState();
      if (s.status === "preparing" || s.status === "waiting" || s.status === "retrying") {
        usePaymentStore.getState().setStatus("idle");
      }
    };
  }, [resetPayment]);

  React.useEffect(() => {
    if (!hydrated) return;
    void cartRepository.calculateTotals().then((r) => {
      if (r.success) setTotals(r.data);
    });
  }, [hydrated, lines, fulfillment]);

  if (!hydrated || !isBootstrapped) return <PaymentSkeleton />;
  if (!isAuthenticated) return <PaymentSkeleton />;

  if (lines.length === 0) {
    return (
      <AppShell title="Payment" backTo="/checkout" showTabs={false} showTopBar>
        <EmptyState
          title="Nothing to pay for"
          description="Your cart is empty. Add items to place an order."
          actionLabel="Browse menu"
          onAction={() => navigate({ to: "/menu" })}
        />
      </AppShell>
    );
  }

  const startPayment = async () => {
    setPreflightIssue(null);
    setFailure(null);
    setStatus("preparing");
    setAbandonmentOpen(false);

    // 1. Validate common checkout requirements
    const preflight = await paymentRepository.validateForPayment();
    if (!preflight.success || !preflight.data.valid) {
      setStatus("idle");
      const message = preflight.success
        ? (preflight.data.issues[0]?.message ?? "Something's not right — please review your order.")
        : preflight.error.message;
      setPreflightIssue(message);
      return;
    }

    // 2. CASH FLOW (COD / Pay at Counter) - skip Razorpay completely!
    if (method === "cash") {
      setStatus("waiting");

      try {
        const isDelivery = fulfillment === "delivery";
        const paymentStatus: PaymentDisplayStatus = isDelivery ? "CASH_PENDING" : "PAY_AT_STORE";
        const paymentLabel = isDelivery ? "Cash on Delivery" : "Pay at Store";

        const created = await orderRepository.createFromCurrentContext({
          paymentMethod: "cash",
          paymentStatus,
          paymentLabel,
        });

        if (!created.success) {
          setStatus("failed");
          setFailure({
            code: created.error.code,
            message: created.error.message,
            retryable: true,
          });
          toast.error("Couldn't place order", { description: created.error.message });
          return;
        }

        setStatus("success");
        AudioService.playSuccess();
        void HapticService.notification("success");
        void cartRepository.clear();
        void navigate({
          to: "/order-confirmation/$orderId",
          params: { orderId: created.data.id },
          replace: true,
        });
      } catch (err) {
        setStatus("failed");
        const message = err instanceof Error ? err.message : "Couldn't place cash order.";
        setFailure({ code: "CASH_ORDER_ERROR", message, retryable: true });
        toast.error("Order failed", { description: message });
      }
      return;
    }

    // 3. ONLINE FLOW (Razorpay Checkout)
    try {
      const orderRes = await paymentRepository.createPaymentOrder();
      if (!orderRes.success) {
        setStatus("failed");
        setFailure({
          code: orderRes.error.code,
          message: orderRes.error.message,
          retryable: true,
        });
        toast.error("Couldn't start payment", { description: orderRes.error.message });
        void navigate({ to: "/cart", replace: true });
        return;
      }
      setOrder(orderRes.data);
      setStatus("waiting");

      await razorpayAdapter.initialize({
        order: orderRes.data,
        prefill: {
          name: user?.name,
          email: (user as { email?: string } | null)?.email,
          contact: user?.phone,
        },
        theme: {
          color: "#0E4825",
        },
      });

      await razorpayAdapter.openCheckout(
        {
          onSuccess: (result: PaymentResult) => void handleSuccess(result),
          onFailure: (err) => {
            setStatus("failed");
            const message = err.description ?? "Payment could not be completed.";
            setFailure({ code: err.code, message, retryable: true });
            toast.error("Payment failed", { description: message });
          },
          onCancel: () => {
            setStatus("cancelled");
            setFailure({
              code: "USER_CANCELLED",
              message: "Payment modal was dismissed.",
              retryable: true,
            });
            setAbandonmentOpen(true);
          },
          onExternalWallet: (walletName) => {
            logger.info("payment.externalWallet", { walletName });
          },
        },
        method,
      );
    } catch (err) {
      setStatus("failed");
      const message = err instanceof Error ? err.message : "Unexpected payment error occurred.";
      setFailure({ code: "PAYMENT_INIT_ERROR", message, retryable: true });
      toast.error("Payment Error", { description: message });
    }
  };

  const handleSuccess = async (result: PaymentResult) => {
    try {
      const verify = await paymentRepository.verifyPayment(result);
      if (!verify.success || !verify.data.verified) {
        setStatus("failed");
        const message = verify.success ? "Payment verification failed." : verify.error.message;
        setFailure({
          code: verify.success ? "VERIFICATION_FAILED" : verify.error.code,
          message,
          retryable: true,
        });
        toast.error("Payment verification failed", { description: message });
        void navigate({ to: "/cart", replace: true });
        return;
      }
      setVerification(verify.data);

      const created = await orderRepository.createFromCurrentContext({
        confirmedOrderId: verify.data.confirmedOrderId,
        paymentMethod: result.method,
        transactionId: result.paymentId,
      });
      // Never celebrate before the order exists: money is taken at this point,
      // so a failed create must scream, not navigate to a confirmation page.
      if (!created.success) {
        setStatus("failed");
        setFailure({
          code: created.error.code,
          message: `Payment of ${result.paymentId} succeeded but the order could not be created: ${created.error.message}.`,
          retryable: false,
          paymentId: result.paymentId,
        });
        toast.error("Payment taken, order not created", {
          description: "Your money is safe. Contact support with payment ID before retrying.",
        });
        return;
      }
      setStatus("success");
      AudioService.playSuccess();
      void HapticService.notification("success");
      void cartRepository.clear();
      const orderId = created.data.id;
      void navigate({
        to: "/order-confirmation/$orderId",
        params: { orderId },
        replace: true,
      });
    } catch (err) {
      setStatus("failed");
      const message = err instanceof Error ? err.message : "Failed to finish order after payment.";
      setFailure({ code: "POST_PAYMENT_ERROR", message, retryable: true });
      toast.error("Order creation failed", { description: message });
    }
  };

  const retry = async () => {
    setStatus("retrying");
    await startPayment();
  };

  const cancelAttempt = async () => {
    if (order) await paymentRepository.cancelPayment(order.orderId);
    resetPayment();
    void navigate({ to: "/checkout" });
  };

  const busy = status === "preparing" || status === "waiting" || status === "retrying";
  const eta =
    fulfillment === "delivery"
      ? activeStore?.etaMinutes
      : (activeStore?.pickupEtaMinutes ?? activeStore?.etaMinutes);
  const grandTotal = totals?.grandTotal ?? 0;

  const instructions =
    fulfillment === "delivery"
      ? deliveryInstructions
      : fulfillment === "takeaway"
        ? pickupInstructions
        : diningNotes;

  const isDelivery = fulfillment === "delivery";
  const selectedCashLabel = isDelivery ? "Cash on Delivery" : "Pay at Store";

  return (
    <AppShell
      title="Secure Checkout"
      backTo="/checkout"
      showTabs={false}
      showTopBar
      contentClassName="pb-[calc(140px+env(safe-area-inset-bottom,0px))]"
      bottomSlot={
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-divider bg-surface/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur shadow-lg">
          <div className="mx-auto flex max-w-[560px] md:max-w-[560px] max-md:max-w-full items-center justify-between gap-4 px-4 py-4">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-text-secondary font-bold">
                To Pay
              </span>
              <span className="type-title-large font-black text-text tabular-nums">
                {formatINR(grandTotal)}
              </span>
            </div>
            <AppButton
              size="lg"
              className="flex-1 max-w-[280px] h-12 rounded-xl text-base font-bold shadow-md shadow-primary/20 active:scale-[0.98] transition-transform"
              onClick={() => void startPayment()}
              loading={busy}
              disabled={grandTotal <= 0}
              iconLeft={method === "online" ? <Lock className="h-4 w-4" /> : undefined}
            >
              {status === "failed" || status === "cancelled"
                ? "Retry checkout"
                : method === "online"
                  ? "Pay Online"
                  : isDelivery
                    ? "Place COD Order"
                    : "Place Order"}
            </AppButton>
          </div>
        </div>
      }
    >
      <div className="mx-auto max-w-[560px] space-y-5 px-4 py-4">
        {/* Step 1: Payment Method Selection */}
        <section aria-labelledby="payment-section-title" className="space-y-3">
          <div className="flex flex-col gap-1">
            <Text
              variant="titleLarge"
              id="payment-section-title"
              className="font-bold tracking-tight"
            >
              How would you like to pay?
            </Text>
            <Text variant="bodyMedium" tone="secondary">
              Select a secure business payment option below.
            </Text>
          </div>
          <PaymentMethodList value={method} onChange={setMethod} disabled={busy} />
        </section>

        {/* Secure badge */}
        <SecurePaymentBadge />

        {/* Step 2: Checkout Summary Card with High Visual Hierarchy */}
        <section
          aria-labelledby="summary-section-title"
          className="rounded-2xl border border-divider bg-surface shadow-sm overflow-hidden"
        >
          <div className="border-b border-divider bg-bg-secondary/40 px-5 py-4">
            <Text
              variant="titleMedium"
              id="summary-section-title"
              className="font-bold tracking-tight"
            >
              Checkout Summary
            </Text>
          </div>

          <div className="divide-y divide-divider px-5">
            {/* Store details */}
            <div className="py-4 flex items-start gap-3">
              <Store className="h-5 w-5 text-text-secondary mt-0.5 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <Text variant="caption" tone="secondary" className="block">
                  Fulfillment Store
                </Text>
                <Text variant="titleMedium" className="font-semibold truncate">
                  {activeStore?.name ?? "Store not selected"}
                </Text>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Text variant="caption" tone="secondary">
                    {activeStore?.area}
                  </Text>
                  {eta && (
                    <span className="inline-flex items-center gap-1 text-text-secondary">
                      <Clock className="h-3 w-3" aria-hidden />
                      <Text variant="caption" tone="secondary">
                        ~{eta} mins
                      </Text>
                    </span>
                  )}
                  <AppBadge tone="neutral" className="capitalize">
                    {fulfillment === "dinein" ? "Dine-in" : fulfillment}
                  </AppBadge>
                </div>
              </div>
            </div>

            {/* Address SNAPSHOT */}
            {isDelivery && selectedAddress && (
              <div className="py-4 flex items-start gap-3">
                <MapPin className="h-5 w-5 text-text-secondary mt-0.5 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <Text variant="caption" tone="secondary" className="block">
                    Delivery Address
                  </Text>
                  <Text variant="bodyMedium" className="font-semibold text-text capitalize">
                    {selectedAddress.label === "other"
                      ? (selectedAddress.customLabel ?? "Other")
                      : selectedAddress.label}
                  </Text>
                  <p className="text-sm text-text-secondary mt-1">
                    {selectedAddress.contactName} ({selectedAddress.contactPhone})
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5 leading-normal">
                    {[
                      selectedAddress.line1,
                      selectedAddress.line2,
                      selectedAddress.landmark ? `Near ${selectedAddress.landmark}` : null,
                      `${selectedAddress.city} - ${selectedAddress.pincode}`,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              </div>
            )}

            {/* Fulfillment Instructions or notes */}
            {instructions && (
              <div className="py-4 flex items-start gap-3">
                <Notebook className="h-5 w-5 text-text-secondary mt-0.5 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <Text variant="caption" tone="secondary" className="block">
                    {isDelivery ? "Delivery Instructions" : "Pickup/Dine-in Notes"}
                  </Text>
                  <Text variant="bodyMedium" className="italic text-text mt-1">
                    "{instructions}"
                  </Text>
                </div>
              </div>
            )}

            {/* Cart Items List */}
            <div className="py-4">
              <div className="mb-2 flex items-center justify-between">
                <Text variant="titleMedium" className="font-bold">
                  Order Summary ({itemCount} {itemCount === 1 ? "item" : "items"})
                </Text>
                <Link to="/cart" className="type-label-large text-primary hover:underline">
                  Edit Cart
                </Link>
              </div>
              <ReviewItemsList lines={lines} />
            </div>

            {/* Applied Promos */}
            {promo && totals && totals.promoDiscount > 0 && (
              <div className="py-3.5 flex items-center justify-between bg-emerald-500/5 -mx-5 px-5">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <Tag className="h-4 w-4 shrink-0" aria-hidden />
                  <Text variant="bodyMedium" className="font-bold">
                    Code: {promo.code}
                  </Text>
                </div>
                <Text
                  variant="bodyMedium"
                  className="font-bold text-emerald-600 dark:text-emerald-400"
                >
                  -{formatINR(totals.promoDiscount)} Off
                </Text>
              </div>
            )}

            {/* Selected payment type readout */}
            <div className="py-3 flex items-center justify-between">
              <Text variant="bodyMedium" tone="secondary">
                Selected Payment Type
              </Text>
              <div className="flex items-center gap-1.5 text-text font-semibold text-sm">
                {method === "online" ? (
                  <>
                    <CreditCard className="h-4 w-4 text-orange-500" aria-hidden />
                    <span>Pay Online</span>
                  </>
                ) : (
                  <>
                    <Coins className="h-4 w-4 text-emerald-500" aria-hidden />
                    <span>{selectedCashLabel}</span>
                  </>
                )}
              </div>
            </div>

            {/* Prices Breakdown */}
            {totals && (
              <div className="py-4 bg-bg-secondary/20 -mx-5 px-5">
                <dl className="space-y-2">
                  <SummaryRow label="Subtotal" value={totals.subtotal} />
                  {totals.promoDiscount > 0 && (
                    <SummaryRow
                      label="Promo Discount"
                      value={-totals.promoDiscount}
                      tone="success"
                    />
                  )}
                  {totals.deliveryFee > 0 && (
                    <SummaryRow label="Delivery Charges" value={totals.deliveryFee} />
                  )}
                  {totals.packingFee > 0 && (
                    <SummaryRow label="Store Packing Charges" value={totals.packingFee} />
                  )}
                  <SummaryRow label="Taxes & Surcharges" value={totals.taxes} />

                  <div className="mt-3 flex items-center justify-between border-t border-divider pt-3">
                    <Text variant="titleLarge" className="font-extrabold text-text">
                      Grand Total
                    </Text>
                    <Text variant="titleLarge" className="font-extrabold text-primary tabular-nums">
                      {formatINR(grandTotal)}
                    </Text>
                  </div>
                </dl>
              </div>
            )}
          </div>
        </section>

        {preflightIssue && (
          <div role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-4">
            <Text variant="bodyMedium" tone="error">
              {preflightIssue}
            </Text>
          </div>
        )}

        <AnimatePresence>
          {(status === "failed" || status === "cancelled") && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              transition={{ duration: 0.2 }}
            >
              <FailurePanel
                title={
                  status === "cancelled"
                    ? "Payment cancelled"
                    : failure?.retryable === false
                      ? "Payment received — order pending"
                      : "Payment failed"
                }
                message={failure?.message ?? "Something went wrong."}
                retryable={failure?.retryable ?? true}
                paymentId={failure?.paymentId}
                onRetry={() => void retry()}
                onBackToCheckout={() => void navigate({ to: "/checkout" })}
                onCancel={() => void cancelAttempt()}
                onContactSupport={() =>
                  void navigate({
                    to: "/support",
                    search: {
                      topic: "payment",
                      paymentId: failure?.paymentId,
                      message: failure?.message,
                    },
                  })
                }
              />
            </motion.div>
          )}
        </AnimatePresence>

        {status === "waiting" && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4 animate-pulse"
          >
            <Spinner />
            <div>
              <Text variant="titleMedium" className="font-bold">
                {method === "cash" ? "Processing order..." : "Waiting for payment"}
              </Text>
              <Text variant="caption" tone="secondary">
                {method === "cash"
                  ? "We are preparing your receipt. Please do not close this screen."
                  : "Complete the checkout inside the Razorpay secure pop-up. Don't close this screen."}
              </Text>
            </div>
          </div>
        )}
        <div className="h-28" aria-hidden="true" />
      </div>

      {/* Abandonment Recovery Bottom Sheet */}
      <RazorpayModalHandler
        isAbandonmentOpen={abandonmentOpen}
        onCloseAbandonment={() => setAbandonmentOpen(false)}
        onRetryPayment={() => void retry()}
        onChangePaymentMethod={() => {
          setAbandonmentOpen(false);
          void navigate({ to: "/checkout" });
        }}
      />
    </AppShell>
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: number; tone?: "success" }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <dt className="text-text-secondary">{label}</dt>
      <dd
        className={
          "font-medium tabular-nums " +
          (tone === "success" ? "text-success font-semibold" : "text-text")
        }
      >
        {value < 0 ? `- ${formatINR(-value)}` : formatINR(value)}
      </dd>
    </div>
  );
}

function FailurePanel({
  title,
  message,
  retryable,
  paymentId,
  onRetry,
  onBackToCheckout,
  onCancel,
  onContactSupport,
}: {
  title: string;
  message: string;
  retryable: boolean;
  paymentId?: string;
  onRetry: () => void;
  onBackToCheckout: () => void;
  onCancel: () => void;
  onContactSupport: () => void;
}) {
  return (
    <div role="alert" className="rounded-xl border border-error/40 bg-error/5 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 text-error shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <Text variant="titleMedium" className="font-bold text-error">
            {title}
          </Text>
          {/* Paid-but-no-order must NEVER say "no money has been charged" or
              offer Retry (double-charge). It shows the payment id + support. */}
          <Text variant="bodyMedium" tone="secondary" className="mt-1 leading-normal">
            {message}{" "}
            {retryable ? (
              "You can try again safely — no money has been charged."
            ) : (
              <>
                Do not pay again. Your payment ID{" "}
                <span className="font-mono font-bold text-text-primary">{paymentId}</span>{" "}
                is recorded — contact support and we will confirm your order or refund you.
              </>
            )}
          </Text>
          <div className="mt-3 flex flex-wrap gap-2">
            {retryable ? (
              <AppButton
                size="sm"
                onClick={onRetry}
                iconLeft={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}
              >
                Retry
              </AppButton>
            ) : (
              <AppButton size="sm" onClick={onContactSupport}>
                Contact support
              </AppButton>
            )}
            <AppButton
              size="sm"
              variant="outlined"
              onClick={onBackToCheckout}
              iconLeft={<ArrowLeft className="h-3.5 w-3.5" aria-hidden />}
            >
              Checkout
            </AppButton>
            <AppButton
              size="sm"
              variant="ghost"
              className="text-xs text-text-secondary"
              onClick={onCancel}
            >
              Cancel order
            </AppButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentSkeleton() {
  return (
    <AppShell title="Payment" backTo="/checkout" showTabs={false} showTopBar>
      <div className="mx-auto max-w-[560px] space-y-3 px-4 py-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
      </div>
    </AppShell>
  );
}

export default PaymentPage;
