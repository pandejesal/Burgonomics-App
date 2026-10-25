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
import { toUserMessage } from "@/core/errors/userMessages";
import { ConfirmDialog } from "@/shared/components/common/ConfirmDialog";
import { needsRepriceAcceptance } from "@/features/checkout/utils/repriceAcceptance";
import { toast } from "@/shared/components/feedback/AppToaster";
import { HapticService } from "@/core/services/haptics";
import { useAppConfig } from "@/core/state/appConfigStore";
import { appConfig, isDev, isReleaseBuild } from "@/core/config/env";

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
import { describePaymentFailure } from "@/features/payments/utils/paymentFailure";
import {
  describePaymentRecovery,
  isRecoveryReason,
  resolveVerifyOutcome,
  type RecoveryReason,
} from "@/features/payments/utils/paymentRecovery";
import { PaymentRecoveryPanel } from "@/features/payments/components/PaymentRecoveryPanel";
import { orderRepository, type PaymentDisplayStatus } from "@/features/orders";
import {
  persistPaymentReconciliation,
  clearPaymentReconciliation,
  hydratePaymentReconciliation,
} from "@/features/payments/state/paymentStore";

/**
 * P1-14: order/payment failures arrive in two flavours. `ordersService` and
 * `PaymentRepository` return copy written for customers — MISSING_AUTH,
 * AUTH_CHANGED, PERSIST_FAILED ("…the kitchen never received it…") and
 * PAYMENT_RECONCILIATION_PENDING ("Do not pay again.") — while
 * `CartRepository`'s pricing catch and `paymentsService`'s transport catch
 * wrap raw exception text in `PRICING_CALCULATION_ERROR` / `GATEWAY_ERROR`.
 * Only the curated codes below pass through verbatim; every other code is
 * logged and mapped, so raw exception text can never reach the failure panel
 * or a toast.
 */
const CURATED_ORDER_FAILURE_CODES = new Set([
  "MISSING_AUTH",
  "MISSING_CONTEXT",
  "AUTH_CHANGED",
  "PERSIST_FAILED",
  "PAYMENT_RECONCILIATION_PENDING",
  "INVALID_AMOUNT",
  "MIN_ORDER",
  // A retry whose checkout context changed: static, customer-readable copy
  // ("Your order details changed…") — pass it through instead of collapsing
  // into a generic failure, so the customer knows to re-check their details.
  "CHECKOUT_CONTEXT_CHANGED",
  // Money-time refusals from the pricing engine (409). Their messages are
  // static, customer-readable sentences, so pass them verbatim instead of
  // collapsing into a generic failure. They only reach here when the create
  // order transport preserves the server's structured code.
  "ITEM_UNAVAILABLE",
  "ITEM_PRICE_UNVERIFIED",
]);

function orderFailureMessage(error: { code: string; message: string }): string {
  if (CURATED_ORDER_FAILURE_CODES.has(error.code)) return error.message;
  console.error("[payment] order/payment failure:", error);
  return toUserMessage(error);
}

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
  const reconciliationPending = usePaymentStore((s) => s.reconciliationPending);
  const reconciliationReason = usePaymentStore((s) => s.reconciliationReason);
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
  const tipAmount = useCheckoutStore((s) => s.tipAmount);
  const loyaltyPointsToRedeem = useCheckoutStore((s) => s.loyaltyPointsToRedeem);

  const [totals, setTotals] = React.useState<CartTotals | null>(null);
  // Authoritative-quote acceptance, same rule as checkout.tsx: the gateway
  // opens on the SERVER's validated amount, so a differing displayed total
  // must be accepted by the customer first. No rate is invented and no fee is
  // sent — we only surface the server's quote before money moves.
  const [repricePrompt, setRepricePrompt] = React.useState<{
    displayed: number;
    authoritative: number;
  } | null>(null);
  // The exact server total already accepted, so the structural display/charge
  // divergence does not prompt again on re-entry.
  const acceptedServerAmount = React.useRef<number | null>(null);
  // Latest launch closure for the acceptance dialog: re-enter the SAME flow
  // after acceptance instead of re-running a different code path.
  const startPaymentRef = React.useRef<() => Promise<void>>(async () => {});
  // M4 fail-closed: when the totals computation fails there is no honest
  // amount to charge, so PAY must say why and offer a retry instead of
  // disabling silently behind a fabricated ₹0.
  const [totalsFailed, setTotalsFailed] = React.useState(false);
  // Hoisted above the early returns below: a hook below a conditional return
  // flips the hook count between renders (guest/empty → authed+filled) and
  // crashes with minified React #310.
  const isOnline = useAppConfig((s) => s.isOnline);
  const [preflightIssue, setPreflightIssue] = React.useState<string | null>(null);
  const [abandonmentOpen, setAbandonmentOpen] = React.useState(false);
  // Loop 11: synchronous re-entry guard — status flips async, so rapid
  // double-tap fires startPayment twice (double charge) before the button
  // shows loading. Reset on every terminal status below.
  const payInFlight = React.useRef(false);

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
  // Reconciliation is the deliberate exception: it is reload/navigation-safe
  // (A08 B9), so an unresolved record for THIS user is re-hydrated right after
  // the reset and the screen opens on the recovery panel instead of a pay
  // button that would start a second payment.
  React.useEffect(() => {
    resetPayment();
    hydratePaymentReconciliation(useAuthStore.getState().user?.id ?? null);
    return () => {
      const s = usePaymentStore.getState();
      if (s.status === "preparing" || s.status === "waiting" || s.status === "retrying") {
        usePaymentStore.getState().setStatus("idle");
      }
    };
  }, [resetPayment]);

  // Loop 11: release the pay re-entry guard on every terminal status so a
  // failed/cancelled payment is retryable but never double-fired.
  const payStatus = usePaymentStore((s) => s.status);
  React.useEffect(() => {
    if (
      payStatus === "idle" ||
      payStatus === "success" ||
      payStatus === "failed" ||
      payStatus === "cancelled"
    ) {
      payInFlight.current = false;
    }
  }, [payStatus]);
  // Production Razorpay mode: live key required for real money movement.
  // No demo/simulation paths in production (FR-005, FR-006). Read from the
  // central config — feature code must never touch import.meta.env directly.
  const razorpayKeyId = appConfig.integrations.razorpayKeyId;
  const hasLiveRazorpayKey = !!razorpayKeyId && razorpayKeyId.startsWith("rzp_live_");
  // The "Demo payments" hint is a DEV affordance only: a release bundle with
  // no live key must fail closed silently, never advertise that payments are
  // simulated (that reads as "money may or may not move").
  const isDevBuild = isDev() && !isReleaseBuild();

  const loadTotals = React.useCallback(async () => {
    try {
      const r = await cartRepository.calculateTotals();
      if (r.success) {
        setTotals(r.data);
        setTotalsFailed(false);
        return;
      }
      // Raw pricing diagnostics are not customer copy (P1-8): log, never show.
      logger.warn("payment.totals_failed", { code: r.error.code });
      setTotalsFailed(true);
      setTotals(null);
    } catch (e: unknown) {
      logger.warn("payment.totals_failed", {
        message: e instanceof Error ? e.message : String(e),
      });
      setTotalsFailed(true);
      setTotals(null);
    }
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    void loadTotals();
  }, [hydrated, lines, fulfillment, loadTotals]);

  // Every hook must run on EVERY render. This ref sync used to sit after the
  // hydration/empty-cart returns below, so the first hydrated render ran one
  // hook more than the skeleton render and React threw #310 ("Rendered more
  // hooks than during the previous render") on the money screen. It is
  // hoisted here; `startPayment` is a hoisted function declaration so the
  // callback can reference it before its textual definition.
  React.useEffect(() => {
    startPaymentRef.current = startPayment;
  });

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

  // Hoisted function declaration (not a const arrow) so the hook above the
  // early returns can bind it before this line is reached.
  async function startPayment() {
    // Sync re-entry guard: a second tap before status flips must not start
    // a second payment. (Terminal statuses reset the ref, see effect below.)
    if (payInFlight.current) return;
    payInFlight.current = true;
    // Belt-and-braces behind the disabled button: never fire Razorpay offline.
    if (!useAppConfig.getState().isOnline) {
      // Release the re-entry guard: `setStatus("idle")` is a no-op when the
      // status is ALREADY idle (the very common first offline tap), so the
      // terminal-status effect below never runs and the button stays dead.
      payInFlight.current = false;
      setPreflightIssue("You are offline. Reconnect to place your order.");
      setStatus("idle");
      return;
    }
    setPreflightIssue(null);
    setFailure(null);
    setStatus("preparing");
    setAbandonmentOpen(false);

    // 1. Validate common checkout requirements
    const preflight = await paymentRepository.validateForPayment();
    if (!preflight.success || !preflight.data.valid) {
      payInFlight.current = false;
      setStatus("idle");
      // Curated preflight-issue copy passes through; the failure branch is
      // typed raw-capable (PaymentRepository), so it is logged + mapped.
      if (!preflight.success) console.error("[payment] preflight failed:", preflight.error);
      const message = preflight.success
        ? (preflight.data.issues[0]?.message ?? "Something's not right — please review your order.")
        : toUserMessage(preflight.error);
      setPreflightIssue(message);
      return;
    }

    // 2. CASH FLOW (COD / Pay at Counter) - skip Razorpay completely!
    if (method === "cash") {
      // COD has no server-side repricing handshake, so the freshly recomputed
      // client bill IS the amount being settled. Recompute it AFTER preflight
      // (which may revalidate the price lock and reprice/86 lines) and demand
      // the SAME explicit acceptance the online path uses when it differs from
      // the figure on screen — otherwise the order is created for a total the
      // customer never reviewed.
      const freshRes = await cartRepository.calculateTotals();
      if (freshRes.success) {
        const shownTotal = totals
          ? Math.max(0, totals.grandTotal + tipAmount - loyaltyPointsToRedeem)
          : undefined;
        const freshTotal = Math.max(
          0,
          freshRes.data.grandTotal + tipAmount - loyaltyPointsToRedeem,
        );
        if (needsRepriceAcceptance(shownTotal, freshTotal, acceptedServerAmount.current)) {
          // Release the re-entry guard before returning to the dialog.
          payInFlight.current = false;
          setStatus("idle");
          setRepricePrompt({ displayed: shownTotal as number, authoritative: freshTotal });
          return;
        }
      }
      // A totals recompute failure is surfaced by createFromCurrentContext,
      // which recomputes and refuses the order — never a COD doc at an
      // unknown price.

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
          const message = orderFailureMessage(created.error);
          setFailure({
            code: created.error.code,
            message,
            retryable: true,
          });
          toast.error("Couldn't place order", { description: message });
          return;
        }

        const reconUid = useAuthStore.getState().user?.id ?? null;
      clearPaymentReconciliation(reconUid);
      usePaymentStore.getState().clearReconciliation();
      setStatus("success");
        AudioService.playSuccess();
        void HapticService.notification("success");
        void cartRepository.clear();
        useCheckoutStore.getState().reset();
        void navigate({
          to: "/order-confirmation/$orderId",
          params: { orderId: created.data.id },
          replace: true,
        });
      } catch (err) {
        setStatus("failed");
        // Raw exception text never reaches the failure panel/toast (P1-8).
        console.error("[payment] cash order exception:", err);
        const message = "We couldn't place your order. Please try again.";
        setFailure({ code: "CASH_ORDER_ERROR", message, retryable: true });
        toast.error("Order failed", { description: message });
      }
      return;
    }

    // 3. ONLINE FLOW (Razorpay Checkout)
    try {
      // Creates the internal payment-pending order FIRST (contract §3) and
      // binds the gateway order to it — the id lives in the payment store.
      const orderRes = await paymentRepository.createPaymentOrder();
      if (!orderRes.success) {
        setStatus("failed");
        const message = orderFailureMessage(orderRes.error);
        setFailure({
          code: orderRes.error.code,
          message,
          // A reconciliation block is not a retryable failure: offering
          // "Retry checkout" there would start a second payment for money
          // the server already has (A08 B9).
          retryable: orderRes.error.code !== "PAYMENT_RECONCILIATION_PENDING",
        });
        toast.error("Couldn't start payment", { description: message });
        // Stay on this screen: the FailurePanel below is the honest surface
        // (retry / support). Bouncing to /cart hid the real error.
        return;
      }
      // Same authoritative-quote gate as checkout.tsx: never open the gateway
      // on a number the customer was not shown. If the server's validated
      // total differs, ask for explicit acceptance first.
      const displayedTotal = totals
        ? Math.max(0, totals.grandTotal + tipAmount - loyaltyPointsToRedeem)
        : undefined;
      const authoritativeTotal =
        typeof orderRes.data.amount === "number" ? orderRes.data.amount : undefined;
      if (
        needsRepriceAcceptance(displayedTotal, authoritativeTotal, acceptedServerAmount.current)
      ) {
        setStatus("idle");
        setRepricePrompt({
          // The gate only returns true when both are finite numbers.
          displayed: displayedTotal as number,
          authoritative: authoritativeTotal as number,
        });
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
            // P1-8: a gateway description is provider text, not customer copy
            // (BAD_REQUEST_ERROR / bank decline strings) — log it raw and give
            // the customer the curated mapper output instead.
            console.error("[payment] gateway onFailure:", err);
            const message = toUserMessage(err);
            setFailure({ code: err.code, message, retryable: true });
            toast.error("Payment failed", { description: message });
          },
          onCancel: () => {
            // Razorpay fires `modal.ondismiss` even after `payment.failed`,
            // so a real failure must never be relabelled as "user cancelled":
            // that would hide the failure reason and re-offer a retry that
            // cannot succeed. Keep the harder failure state.
            if (usePaymentStore.getState().status === "failed") return;
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
      // Raw exception text never reaches the failure panel/toast (P1-8).
      console.error("[payment] payment initiation exception:", err);
      const message = "We couldn't start the payment. Please try again.";
      setFailure({ code: "PAYMENT_INIT_ERROR", message, retryable: true });
      toast.error("Payment Error", { description: message });
    }
  }

  const handleSuccess = async (result: PaymentResult) => {
    // Contract §3: verification binds the gateway payment to the internal
    // order created before Razorpay opened (never to the gateway id alone).
    const internalOrderId = usePaymentStore.getState().internalOrderId;
    const reconUid = useAuthStore.getState().user?.id ?? null;
    /**
     * Every uncertain post-gateway outcome funnels through here: persist the
     * uid-scoped reconciliation record (which blocks a new payment now and
     * after a reload) and show the recovery panel — never markPaymentFailed,
     * never clear the cart, never navigate to confirmation, never a re-pay.
     */
    const enterReconciliation = (reason: RecoveryReason, confirmedInternal?: string | null) => {
      const store = usePaymentStore.getState();
      const boundInternal = confirmedInternal ?? internalOrderId ?? store.internalOrderId ?? null;
      const boundGateway = result.orderId ?? store.gatewayOrderId ?? null;
      store.setReconciliation(true, reason, boundInternal, boundGateway);
      persistPaymentReconciliation(reconUid, {
        internalOrderId: boundInternal,
        gatewayOrderId: boundGateway,
        reason,
      });
      const copy = describePaymentRecovery(reason);
      setStatus("waiting");
      setFailure({
        code: reason,
        message: copy.body,
        retryable: false,
        paymentId: result.paymentId,
      });
      toast.info(copy.title, {
        description: `${copy.body}${result.paymentId ? ` Payment ID ${result.paymentId}.` : ""}`,
      });
    };

    try {
      const verify = await paymentRepository.verifyPayment({
        ...result,
        internalOrderId: internalOrderId ?? undefined,
      });
      const outcome = resolveVerifyOutcome({
        verify,
        internalOrderId,
        gatewayOrderId: result.orderId,
        paymentId: result.paymentId,
      });

      if (outcome.kind === "uncaptured") {
        // Only a server-proven non-capture may flip the order to failed —
        // signature failures and unknown codes never reach here (A08 B1).
        setStatus("failed");
        setFailure({
          code: outcome.code,
          message: outcome.message,
          retryable: outcome.retryable,
          paymentId: result.paymentId,
        });
        toast.error("Payment verification failed", { description: outcome.message });
        void orderRepository.markPaymentFailed(outcome.internalOrderId).catch(() => undefined);
        return;
      }

      if (outcome.kind === "reconciliation") {
        // 503 / bad signature / exhausted 202 / awaiting_capture / terminal:
        // honest recovery, no new payment.
        enterReconciliation(outcome.reason);
        return;
      }

      // Both non-verified kinds returned above, so only the verified success
      // remains; the guard keeps the fallthrough fail-closed regardless.
      if (outcome.kind !== "verified") return;
      const verification = outcome.verification;
      setVerification(verification);

      // Re-uses the SAME internal order (same id) — the paid order replaces
      // the payment-pending doc instead of creating a second one.
      const created = await orderRepository.finalizePaidOrder({
        confirmedOrderId: internalOrderId ?? verification.confirmedOrderId,
        transactionId: result.paymentId,
      });
      // Never celebrate before the order exists: money is taken at this point,
      // so a failed create must scream, not navigate to a confirmation page.
      if (!created.success) {
        enterReconciliation("PAYMENT_SYNC_PENDING", verification.confirmedOrderId || null);
        return;
      }
      clearPaymentReconciliation(reconUid);
      usePaymentStore.getState().clearReconciliation();
      setStatus("success");
      AudioService.playSuccess();
      void HapticService.notification("success");
      void cartRepository.clear();
      useCheckoutStore.getState().reset();
      const orderId = created.data.id;
      void navigate({
        to: "/order-confirmation/$orderId",
        params: { orderId },
        replace: true,
      });
    } catch (err) {
      // Post-gateway unknown exception (verify/finalize threw after money may
      // have moved): reconciliation, never a failed state that invites re-pay.
      logger.warn("payment.post_gateway_exception", {
        message: err instanceof Error ? err.message : String(err),
      });
      enterReconciliation("PAYMENT_SYNC_PENDING");
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
  // Recovery state — a post-gateway outcome we could not confirm (A08 B9).
  // Rendered instead of the Razorpay spinner and instead of FailurePanel.
  const recoveryReason: RecoveryReason | null =
    reconciliationPending && isRecoveryReason(reconciliationReason)
      ? reconciliationReason
      : status === "waiting" && failure && isRecoveryReason(failure.code)
        ? failure.code
        : null;
  // No new payment may start from a money-possible state: reconciliation is
  // pending (persisted per user) or the last failure was not retryable.
  const payBlocked =
    reconciliationPending || (failure != null && !failure.retryable && status !== "success");
  const eta =
    fulfillment === "delivery"
      ? activeStore?.etaMinutes
      : (activeStore?.pickupEtaMinutes ?? activeStore?.etaMinutes);
  const grandTotal = totals?.grandTotal ?? 0;
  // The gateway/COD amount includes the persisted delivery tip and loyalty
  // redemption (PaymentRepository sends both); To Pay must show that same
  // figure the reprice gate compares, not the pre-tip subtotal.
  const finalPayable = Math.max(0, grandTotal + tipAmount - loyaltyPointsToRedeem);

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
                {totals ? formatINR(finalPayable) : "—"}
              </span>
            </div>
            <AppButton
              size="lg"
              className="flex-1 max-w-[280px] h-12 rounded-xl text-base font-bold shadow-md shadow-primary/20 active:scale-[0.98] transition-transform"
              onClick={() => void startPayment()}
              loading={busy && !payBlocked}
              disabled={finalPayable <= 0 || !isOnline || payBlocked}
              title={
                payBlocked
                  ? "We are confirming your payment — please do not pay again"
                  : !isOnline
                    ? "Back online to place your order"
                    : totalsFailed
                      ? "Couldn't compute your bill — retry above"
                      : undefined
              }
              iconLeft={method === "online" && !payBlocked ? <Lock className="h-4 w-4" /> : undefined}
            >
              {payBlocked
                ? "Payment under review"
                : status === "failed" || status === "cancelled"
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
                  {tipAmount > 0 && <SummaryRow label="Delivery Tip" value={tipAmount} />}
                  {loyaltyPointsToRedeem > 0 && (
                    <SummaryRow
                      label="Grill Coins Redeemed"
                      value={-loyaltyPointsToRedeem}
                      tone="success"
                    />
                  )}

                  <div className="mt-3 flex items-center justify-between border-t border-divider pt-3">
                    <Text variant="titleLarge" className="font-extrabold text-text">
                      To Pay
                    </Text>
                    <Text variant="titleLarge" className="font-extrabold text-primary tabular-nums">
                      {formatINR(finalPayable)}
                    </Text>
                  </div>
                </dl>
              </div>
            )}
          </div>
        </section>

        {/* Totals failed (M4): say why PAY is unavailable and offer a retry —
            never a silent dead button priced against an unknown bill. */}
        {totalsFailed && (
          <div
            role="alert"
            aria-live="assertive"
            className="flex items-center justify-between gap-3 rounded-xl border border-error/40 bg-error/5 p-4"
          >
            <Text variant="bodyMedium" tone="error">
              Couldn&apos;t compute your bill. Check your connection and retry.
            </Text>
            <AppButton
              size="sm"
              onClick={() => void loadTotals()}
              iconLeft={<RefreshCcw className="h-3.5 w-3.5" aria-hidden />}
            >
              Retry
            </AppButton>
          </div>
        )}

        {preflightIssue && (
          <div role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-4">
            <Text variant="bodyMedium" tone="error">
              {preflightIssue}
            </Text>
          </div>
        )}

        {method === "online" && !hasLiveRazorpayKey && isDevBuild && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <Text variant="bodyMedium" className="font-bold">
              Demo payments: no live Razorpay key is configured, so online payment will simulate
              and then fail verification — no money moves. Use cash, or configure keys.
            </Text>
          </div>
        )}

        <AnimatePresence>
          {!recoveryReason && (status === "failed" || status === "cancelled") && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              transition={{ duration: 0.2 }}
            >
              <FailurePanel
                status={status}
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

        {/* Post-gateway recovery (A08 B9): payment id + do-not-pay-again +
            support and existing-order actions, instead of the generic
            Razorpay spinner. No Retry/Pay action can start a new payment. */}
        {recoveryReason && status !== "success" && (
          <PaymentRecoveryPanel
            reason={recoveryReason}
            paymentId={failure?.paymentId ?? null}
            orderId={order?.orderId ?? null}
            onContactSupport={() =>
              void navigate({
                to: "/support",
                search: {
                  topic: "payment",
                  paymentId: failure?.paymentId ?? undefined,
                  message: failure?.message ?? undefined,
                },
              })
            }
            onCheckOrders={() => void navigate({ to: "/orders" })}
          />
        )}

        {status === "waiting" && !recoveryReason && (
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
      <ConfirmDialog
        open={repricePrompt !== null}
        onOpenChange={(open) => {
          if (!open) setRepricePrompt(null);
        }}
        title="Your total has been updated"
        description={
          repricePrompt
            ? `The final total is ${formatINR(repricePrompt.authoritative)} (you were shown ${formatINR(repricePrompt.displayed)}). Continue with the updated amount?`
            : undefined
        }
        confirmLabel="Continue"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (!repricePrompt) return;
          // Accept this exact server total, then re-enter the same flow; the
          // remembered acceptance prevents an identical prompt on the retry.
          acceptedServerAmount.current = repricePrompt.authoritative;
          setRepricePrompt(null);
          void startPaymentRef.current();
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
  status,
  message,
  retryable,
  paymentId,
  onRetry,
  onBackToCheckout,
  onCancel,
  onContactSupport,
}: {
  status: string;
  message: string;
  retryable: boolean;
  paymentId?: string;
  onRetry: () => void;
  onBackToCheckout: () => void;
  onCancel: () => void;
  onContactSupport: () => void;
}) {
  // Copy/CTA decisions come from describePaymentFailure (unit-tested): the
  // paid-but-no-order branch must NEVER say "no money has been charged" or
  // offer Retry (double-charge). It shows the payment id + support.
  const content = describePaymentFailure({ status, message, retryable });
  return (
    <div role="alert" className="rounded-xl border border-error/40 bg-error/5 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 text-error shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <Text variant="titleMedium" className="font-bold text-error">
            {content.title}
          </Text>
          <Text variant="bodyMedium" tone="secondary" className="mt-1 leading-normal">
            {content.body}{" "}
            {!retryable && (
              <>
                Payment ID{" "}
                <span className="font-mono font-bold text-text-primary">{paymentId}</span>
              </>
            )}
          </Text>
          <div className="mt-3 flex flex-wrap gap-2">
            {content.showRetry ? (
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
