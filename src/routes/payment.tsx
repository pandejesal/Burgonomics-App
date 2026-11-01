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
import { FailureState } from "@/shared/components/feedback/FailureState";
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
import { appConfig } from "@/core/config/env";

import { useCartStore, selectItemCount, cartRepository } from "@/features/cart";
import {
  ReviewItemsList,
  useCheckoutStore,
  useCheckoutFees,
  deliveryQuoteView,
  isDeliveryQuoteRefusal,
} from "@/features/checkout";
import type { CartTotals } from "@/features/cart/models";
import { useStoreSelection, storeSupportsFulfillment } from "@/features/stores/state/storeStore";
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
import type { PaymentOrder, PaymentPreflight } from "@/features/payments/models";
import type { ApiResult } from "@/core/network/http";
import { ok } from "@/core/network/http";
import {
  describePaymentFailure,
  isNonRetryableOrderFailure,
  STORE_NOT_LINKED,
} from "@/features/payments/utils/paymentFailure";
import {
  describePaymentRecovery,
  isRecoveryReason,
  resolveVerifyOutcome,
  type RecoveryReason,
} from "@/features/payments/utils/paymentRecovery";
import { PaymentRecoveryPanel } from "@/features/payments/components/PaymentRecoveryPanel";
import { orderRepository, type PaymentDisplayStatus } from "@/features/orders";
import type { Order } from "@/features/orders/models";
import { classifyResumableOrder, isTerminalResumeRefusal } from "@/features/payments/utils/resumeOrder";
import { resumeContextFromOrder, resumeDisplayTotals } from "@/features/payments/utils/resumeContext";
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
  // CUS-16 resume: an unpaid order's "Complete payment" opens /payment with
  // the existing order id so the gateway binds to it instead of minting a
  // second order.
  validateSearch: (search: Record<string, unknown>) => ({
    orderId: typeof search.orderId === "string" ? search.orderId : undefined,
  }),
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
  // Test harnesses may mount this component without a router context; the
  // resume id is optional, so a missing hook simply means a normal checkout.
  const search =
    (Route as unknown as { useSearch?: () => { orderId?: unknown } }).useSearch?.() ?? {};
  const resumeOrderId =
    typeof search.orderId === "string" && search.orderId.trim()
      ? search.orderId.trim()
      : undefined;

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

  /* ── CUS-16 resume: bill the ORDER, never the cart ─────────────────────
   * The customer reaches this screen from "Complete payment" on an unpaid
   * order, and by then the cart is usually empty. The document is loaded
   * first; everything below prices, displays and charges THAT document. */
  const [resumeOrder, setResumeOrder] = React.useState<Order | null>(null);
  const [resumeStatus, setResumeStatus] = React.useState<
    "idle" | "loading" | "loaded" | "error" | "unavailable"
  >("idle");
  const [resumeError, setResumeError] = React.useState<string | null>(null);
  const [resumeReload, setResumeReload] = React.useState(0);

  const resume = React.useMemo(() => resumeContextFromOrder(resumeOrder), [resumeOrder]);
  const resumeState = resumeOrder ? classifyResumableOrder(resumeOrder) : null;

  // The outlet / mode / lines / address this screen must bill: the order's
  // when resuming, the live cart's otherwise.
  const billingLines = resume ? resume.cart.lines : lines;
  const billingFulfillment = resume ? resume.fulfillment : fulfillment;
  const billingStore = resume ? resume.store : activeStore;
  const billingAddress = resume ? resume.address : selectedAddress;
  const billingItemCount = resume
    ? billingLines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0)
    : itemCount;
  const billingPromo = resume ? (resume.cart.promo ?? null) : promo;

  const feesOverride = React.useMemo(() => {
    if (!resume) return undefined;
    return {
      storeId: resume.store.id,
      branchId: resume.store.partnerBranchId ?? null,
      fulfillment: resume.fulfillment,
      dropLat: typeof resume.address?.lat === "number" ? resume.address.lat : null,
      dropLng: typeof resume.address?.lng === "number" ? resume.address.lng : null,
    };
  }, [resume]);

  // R8: the payment screen re-quotes on entry/address change/expiry and gates
  // PAY on a live server quote (cash included).
  const {
    state: feesState,
    view: quoteView,
    refresh: refreshQuote,
  } = useCheckoutFees(feesOverride);

  const [totals, setTotals] = React.useState<CartTotals | null>(null);
  // Authoritative-quote acceptance, same rule as checkout.tsx: the gateway
  // opens on the SERVER's validated amount, so a differing displayed total
  // must be accepted by the customer first. No rate is invented and no fee is
  // sent — we only surface the server's quote before money moves.
  const [repricePrompt, setRepricePrompt] = React.useState<{
    displayed: number;
    authoritative: number;
  } | null>(null);
  // CUS-11: the accepted server total is what the To Pay bar must show while
  // Razorpay is open (display only; the gateway already has this amount).
  const [acceptedServerTotal, setAcceptedServerTotal] = React.useState<number | null>(null);
  // The exact server total already accepted, so the structural display/charge
  // divergence does not prompt again on re-entry.
  const acceptedServerAmount = React.useRef<number | null>(null);
  // CUS-09: the internal `orders/{id}` document AND the Razorpay order minted
  // by the attempt that raised the reprice prompt. Accepting the new total must
  // CONTINUE from this exact pair. Re-running the place-order path wrote the
  // same `orders/{id}` again — firestore.rules allow create only, so the SDK
  // was denied "Missing or insufficient permissions", the customer saw
  // PERSIST_FAILED and Razorpay never opened (live run 3).
  const pendingGatewayOrder = React.useRef<PaymentOrder | null>(null);
  // R8: true when the visible price dialog came from a 409 delivery-quote
  // refusal (no gateway order yet), so Continue must re-create instead of open.
  const quoteRepricePrompt = React.useRef(false);
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
        // Keep the resume id across sign-in, or the next attempt would mint a
        // second order instead of paying the abandoned one.
        search: {
          redirect: resumeOrderId
            ? `/payment?orderId=${encodeURIComponent(resumeOrderId)}`
            : "/payment",
        },
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

  // CUS-16: resume an abandoned unpaid order — bind this attempt to the id in
  // the URL so the gateway order, verification and finalize all name that
  // order, and no second `orders/{id}` is ever written.
  React.useEffect(() => {
    if (resumeOrderId) usePaymentStore.getState().setInternalOrderId(resumeOrderId);
  }, [resumeOrderId]);

  // CUS-16 follow-up: LOAD the order the customer asked to pay. The cart is
  // usually empty here, so the document (not the cart) supplies the lines,
  // amount, address and outlet. A failed read is a failure with a retry —
  // never "nothing to pay for".
  React.useEffect(() => {
    if (!hydrated || !isBootstrapped || !isAuthenticated || !resumeOrderId) return;
    let cancelled = false;
    setResumeStatus("loading");
    setResumeError(null);
    void orderRepository
      .getOrder(resumeOrderId)
      .then((res) => {
        if (cancelled) return;
        if (!res.success) {
          console.error("[payment] resume order read failed:", res.error);
          setResumeOrder(null);
          setResumeError(toUserMessage(res));
          setResumeStatus("error");
          return;
        }
        setResumeOrder(res.data);
        setResumeStatus(res.data ? "loaded" : "unavailable");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("[payment] resume order read threw:", err);
        setResumeOrder(null);
        setResumeError("We couldn't load this order. Please check your connection and try again.");
        setResumeStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, isBootstrapped, isAuthenticated, resumeOrderId, resumeReload]);

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
  const isDevBuild = appConfig.env === "development";

  // The bill the customer was shown includes the persisted delivery tip, and
  // the server charges it. Comparing the gateway amount against a tip-less
  // total raised a bogus "total has been updated" prompt on every tipped order.
  const effectiveTipAmount = resume ? resume.tipAmount : tipAmount;
  const displayedBillTotal =
    totals === null ? undefined : Math.max(0, totals.grandTotal + effectiveTipAmount);

  const loadTotals = React.useCallback(async () => {
    try {
      // Resuming: the ORDER has fixed lines, so its stored totals are the
      // bill — the cart is never priced. Before the document arrives there is
      // no bill yet (PAY stays disabled), and no cart read is spent.
      if (resumeOrderId) {
        if (!resume) {
          setTotals(null);
          setTotalsFailed(false);
          return;
        }
        setTotals(resumeDisplayTotals(resume.totals, feesState, resume.fulfillment));
        setTotalsFailed(false);
        return;
      }
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
  }, [resume, resumeOrderId, feesState]);

  React.useEffect(() => {
    if (!hydrated) return;
    void loadTotals();
  }, [hydrated, lines, fulfillment, loadTotals, feesState]);

  if (!hydrated || !isBootstrapped) return <PaymentSkeleton />;
  if (!isAuthenticated) return <PaymentSkeleton />;

  /* ── CUS-16 resume gates ──────────────────────────────────────────────
   * Paying an existing order must never depend on the cart, and must never
   * offer a payment the server would refuse. Each state says exactly what is
   * true of this order; none of them is "your cart is empty". */
  if (resumeOrderId) {
    if (resumeStatus === "loading" || resumeStatus === "idle") return <PaymentSkeleton />;
    if (resumeStatus === "error") {
      return (
        <AppShell title="Payment" backTo="/orders" showTabs={false} showTopBar>
          <FailureState
            title="Couldn't load this order"
            message={resumeError ?? "We couldn't load this order. Please try again."}
            onRetry={() => setResumeReload((value) => value + 1)}
          />
        </AppShell>
      );
    }
    if (resumeStatus === "unavailable" || !resumeOrder) {
      return (
        <AppShell title="Payment" backTo="/orders" showTabs={false} showTopBar>
          <EmptyState
            title="Order not found"
            description="We couldn't find this order in your account. Open your orders to see what needs paying."
            actionLabel="View my orders"
            onAction={() => navigate({ to: "/orders" })}
          />
        </AppShell>
      );
    }
    if (resumeState && resumeState.kind !== "payable") {
      const settled = resumeState.kind === "paid";
      const atCounter = resumeState.kind === "cash";
      const blockedReason = resumeState.kind === "blocked" ? resumeState.reason : null;
      const title = settled
        ? "This order is already paid"
        : atCounter
          ? "This order is paid at the counter"
          : blockedReason === "expired"
            ? "This order expired before it was paid"
            : blockedReason === "cancelled"
              ? "This order was cancelled"
              : "This order could not be completed";
      const description = settled
        ? "Nothing is left to pay. Open the order to follow it or see the receipt."
        : atCounter
          ? "Cash and pay-at-store orders are settled at the outlet, so there is nothing to pay online."
          : blockedReason === "expired"
            ? "Unpaid orders expire so the kitchen is never sent food nobody paid for. Place a new order to try again."
            : "No payment can be taken for this order. Open it for its full status, or contact support.";
      return (
        <AppShell title="Payment" backTo="/orders" showTabs={false} showTopBar>
          <EmptyState
            title={title}
            description={description}
            actionLabel={settled || atCounter ? "View order" : "View my orders"}
            onAction={() =>
              settled || atCounter
                ? void navigate({
                    to: "/orders/$orderId/track",
                    params: { orderId: resumeOrderId },
                  })
                : void navigate({ to: "/orders" })
            }
          />
        </AppShell>
      );
    }
  } else if (lines.length === 0) {
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

  /**
   * CUS-09: opens Razorpay for an order that ALREADY exists (the internal
   * `orders/{id}` doc and the gateway order were both created by
   * `createPaymentOrder`). Both the first attempt and the reprice-acceptance
   * path go through here, so exactly ONE gateway order is opened, always on the
   * server's amount (`serverOrder.amount`) — never the stale displayed total.
   */
  const openGatewayForOrder = async (serverOrder: PaymentOrder) => {
    setOrder(serverOrder);
    setStatus("waiting");
    try {
      await razorpayAdapter.initialize({
        order: serverOrder,
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
  };

  const startPayment = async () => {
    // Sync re-entry guard: a second tap before status flips must not start
    // a second payment. (Terminal statuses reset the ref, see effect below.)
    if (payInFlight.current) return;
    // Re-read the live selection: the outlet or mode can change after mount
    // (another tab, a menu/store switch) without this screen re-rendering.
    // A resumed order is exempt — its outlet and mode come from the document,
    // not from whatever the cart/store store currently holds.
    const liveSelection = useStoreSelection.getState();
    if (
      !resume &&
      (!liveSelection.activeStore ||
        !liveSelection.fulfillment ||
        !storeSupportsFulfillment(liveSelection.activeStore, liveSelection.fulfillment))
    ) {
      setStatus("idle");
      setPreflightIssue(
        !liveSelection.activeStore
          ? "Choose an outlet to continue."
          : !liveSelection.fulfillment
            ? "Choose how you'd like this order: delivery, takeaway or dine-in."
            : "This outlet is not offering your selected order type right now.",
      );
      return;
    }
    // CUS-16: an existing order can only be paid while it is still payable.
    // A capture that lands between the read and the tap must not be re-charged.
    if (resume && resumeState && resumeState.kind !== "payable") {
      setStatus("idle");
      setPreflightIssue(
        resumeState.kind === "paid"
          ? "This order is already paid."
          : "This order can no longer be paid.",
      );
      return;
    }
    // A retry must not start a payment while the bill is unknown/failed —
    // the disabled CTA alone does not cover the FailurePanel Retry path.
    if (totals === null || totalsFailed) {
      setStatus("idle");
      setPreflightIssue(
        totalsFailed
          ? "Couldn't compute your bill. Please retry above."
          : "Your bill is still being computed.",
      );
      return;
    }
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

    // R8: never start a payment without a live quote for this order type. The
    // screen may have sat open until the quote expired, so read it fresh.
    const quoteNow = deliveryQuoteView({
      state: useCheckoutStore.getState().checkoutFees,
      fulfillment: billingFulfillment,
      hasAddress:
        Number.isFinite(billingAddress?.lat) && Number.isFinite(billingAddress?.lng),
    });
    if (!quoteNow.payEnabled) {
      payInFlight.current = false;
      setStatus("idle");
      setPreflightIssue(quoteNow.message ?? "Getting delivery price");
      if (quoteNow.canRetry || quoteNow.status === "idle" || quoteNow.status === "loading") {
        void refreshQuote();
      }
      return;
    }

    setStatus("preparing");
    setAbandonmentOpen(false);

    // CUS-09: a previous tap already created the internal order AND the
    // Razorpay order and is only waiting for the customer to accept the
    // server's total (they just declined the prompt, or tapped Pay again).
    // Re-run NOTHING here: no second `orders/{id}` write (denied as an update
    // by firestore.rules), no second gateway order. Re-offer the same figure
    // and, once accepted, open the SAME gateway order.
    const heldOrder = pendingGatewayOrder.current;
    if (heldOrder) {
      const heldAuthoritative = typeof heldOrder.amount === "number" ? heldOrder.amount : undefined;
      if (
        needsRepriceAcceptance(displayedBillTotal, heldAuthoritative, acceptedServerAmount.current)
      ) {
        // Nothing is in flight while the customer decides — never leave the
        // sync re-entry guard held behind a dialog (CUS-07).
        payInFlight.current = false;
        setStatus("idle");
        quoteRepricePrompt.current = false;
        setRepricePrompt({
          displayed: displayedBillTotal as number,
          authoritative: heldAuthoritative as number,
        });
        return;
      }
      pendingGatewayOrder.current = null;
      await openGatewayForOrder(heldOrder);
      return;
    }

    // 1. Validate common checkout requirements
    // CUS-16: a resumed order is NOT validated against the cart — the cart is
    // empty, and the document already cleared every one of these gates when it
    // was created. The server re-asserts ownership, unpaid state and price.
    let preflight: ApiResult<PaymentPreflight>;
    if (resume) {
      preflight = { success: true, data: { valid: true, issues: [] } };
    } else {
      // CUS-07: this await used to sit outside every try/catch. A preflight that
      // REJECTED (repository/store read throwing) escaped startPayment with the
      // synchronous `payInFlight` guard still held and the status stuck on
      // "preparing" — the spinner spun forever and every later tap returned
      // silently at the guard. Release the guard and surface a retryable failure:
      // no gateway has opened at this point, so nothing can have been charged.
      try {
        preflight = await paymentRepository.validateForPayment();
      } catch (err) {
        console.error("[payment] preflight failed:", err);
        payInFlight.current = false;
        setStatus("failed");
        const message = "We couldn't check your order. Please try again.";
        setFailure({ code: "PREFLIGHT_ERROR", message, retryable: true });
        toast.error("Couldn't start payment", { description: message });
        return;
      }
    }
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
    // A resumed order already chose online payment and sits unpaid on the
    // server; switching it to cash here would mint a second order.
    if (method === "cash" && !resume) {
      setStatus("waiting");

      try {
        const fresh = await cartRepository.calculateTotals();
        if (!fresh.success) {
          throw new Error("Cash bill could not be refreshed");
        }
        if (
          needsRepriceAcceptance(
            totals.grandTotal,
            fresh.data.grandTotal,
            acceptedServerAmount.current,
          )
        ) {
          setTotals(fresh.data);
          payInFlight.current = false;
          setStatus("idle");
          quoteRepricePrompt.current = true;
          setRepricePrompt({ displayed: totals.grandTotal, authoritative: fresh.data.grandTotal });
          return;
        }
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
      const quoteForPayment = useCheckoutStore.getState().checkoutFees;
      const orderRes = await paymentRepository.createPaymentOrder({
        // R8/R6: the server binds the charge to this courier quote.
        deliveryQuoteId:
          billingFulfillment === "delivery" && quoteForPayment.status === "ready"
            ? (quoteForPayment.deliveryQuoteId ?? undefined)
            : undefined,
        // CUS-16: pay the EXISTING unpaid order; never create another one,
        // and price it from that document rather than the (usually empty) cart.
        resumeOrderId,
        resumeOrder: resumeOrder ?? undefined,
      });
      if (!orderRes.success) {
        // A refusal that proves this order can never be paid again (paid,
        // foreign, missing, terminal) must not be offered as a retry.
        if (isTerminalResumeRefusal(orderRes.error.code)) {
          payInFlight.current = false;
          setStatus("failed");
          const message = orderFailureMessage(orderRes.error);
          setFailure({ code: orderRes.error.code, message, retryable: false });
          toast.error("Couldn't start payment", { description: message });
          return;
        }
        // Stale/missing quote: re-quote, then show the updated figure through
        // the existing price dialog. No gateway opened, nothing was charged.
        if (billingFulfillment === "delivery" && isDeliveryQuoteRefusal(orderRes.error.code)) {
          payInFlight.current = false;
          setStatus("idle");
          setFailure(null);
          const displayed = displayedBillTotal ?? null;
          const next = await refreshQuote();
          // A resumed order has fixed lines: its bill is the document's total
          // with the server's new fee, never a cart recomputation.
          const recalculated: ApiResult<CartTotals> = resume
            ? ok(resumeDisplayTotals(resume.totals, next, resume.fulfillment))
            : await cartRepository.calculateTotals();
          if (next.status !== "ready" || !recalculated.success) {
            const message =
              next.status === "unserviceable"
                ? "Delivery isn't available to this address"
                : "We couldn't get an updated delivery price. Please try again.";
            setPreflightIssue(message);
            toast.error("Delivery price unavailable", { description: message });
            return;
          }
          setTotals(recalculated.data);
          setTotalsFailed(false);
          setAcceptedServerTotal(null);
          acceptedServerAmount.current = null;
          if (displayed !== null && recalculated.data.grandTotal !== displayed) {
            quoteRepricePrompt.current = true;
            setRepricePrompt({ displayed, authoritative: recalculated.data.grandTotal });
            return;
          }
          await startPayment();
          return;
        }
        setStatus("failed");
        const message = orderFailureMessage(orderRes.error);
        setFailure({
          code: orderRes.error.code,
          message,
          // A reconciliation block and a store that is not taking online
          // orders are not retryable: offering "Retry checkout" there would
          // start a second payment for money the server already has (A08 B9),
          // or invite a retry that can never succeed.
          retryable: !isNonRetryableOrderFailure(orderRes.error.code),
        });
        toast.error("Couldn't start payment", { description: message });
        // Stay on this screen: the FailurePanel below is the honest surface
        // (retry / support). Bouncing to /cart hid the real error.
        return;
      }
      // Same authoritative-quote gate as checkout.tsx: never open the gateway
      // on a number the customer was not shown. If the server's validated
      // total differs, ask for explicit acceptance first.
      const displayedTotal = displayedBillTotal;
      const authoritativeTotal =
        typeof orderRes.data.amount === "number" ? orderRes.data.amount : undefined;
      if (
        needsRepriceAcceptance(displayedTotal, authoritativeTotal, acceptedServerAmount.current)
      ) {
        // CUS-09: the internal order is already persisted and the Razorpay
        // order already exists. Hold that exact pair so acceptance CONTINUES
        // from it — re-running the place-order path rewrote `orders/{id}`
        // (an update, denied by firestore.rules) and Razorpay never opened.
        pendingGatewayOrder.current = orderRes.data;
        // Nothing is in flight while the customer reads the dialog: release the
        // sync guard so declining can never wedge the Pay button (CUS-07).
        payInFlight.current = false;
        setStatus("idle");
        quoteRepricePrompt.current = false;
        setRepricePrompt({
          // The gate only returns true when both are finite numbers.
          displayed: displayedTotal as number,
          authoritative: authoritativeTotal as number,
        });
        return;
      }

      await openGatewayForOrder(orderRes.data);
    } catch (err) {
      setStatus("failed");
      // Raw exception text never reaches the failure panel/toast (P1-8).
      console.error("[payment] payment initiation exception:", err);
      const message = "We couldn't start the payment. Please try again.";
      setFailure({ code: "PAYMENT_INIT_ERROR", message, retryable: true });
      toast.error("Payment Error", { description: message });
    }
  };

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
    // CUS-07: never flip to a busy status while a payment is genuinely in
    // flight — startPayment would return at the re-entry guard and the screen
    // would stay on "retrying" forever. If nothing is in flight, startPayment
    // itself moves to "preparing", so the retry stays visibly busy.
    if (payInFlight.current) return;
    setStatus("retrying");
    await startPayment();
  };

  const cancelAttempt = async () => {
    if (order) await paymentRepository.cancelPayment(order.orderId);
    resetPayment();
    // A resumed order belongs to history, not to a cart this screen never read.
    void navigate({ to: resumeOrderId ? "/orders" : "/checkout" });
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
  // D-01: a store that is not linked to a partner branch can never pay, so the
  // button says so instead of the reconciliation "under review" copy.
  const storeNotLinked = status !== "success" && failure?.code === STORE_NOT_LINKED;
  const eta =
    billingFulfillment === "delivery"
      ? billingStore?.etaMinutes
      : (billingStore?.pickupEtaMinutes ?? billingStore?.etaMinutes);
  const grandTotal = acceptedServerTotal ?? totals?.grandTotal ?? 0;
  // The gateway order is minted with the persisted tip included, so the "To
  // Pay" figure must show it too — otherwise the customer sees a smaller
  // number than the amount they are charged.
  const finalPayable =
    grandTotal +
    (typeof effectiveTipAmount === "number" && Number.isFinite(effectiveTipAmount)
      ? effectiveTipAmount
      : 0);

  const instructions = resume
    ? (resumeOrder?.fulfillmentInstructions ?? "")
    : fulfillment === "delivery"
      ? deliveryInstructions
      : fulfillment === "takeaway"
        ? pickupInstructions
        : diningNotes;

  const isDelivery = billingFulfillment === "delivery";
  const selectedCashLabel = isDelivery ? "Cash on Delivery" : "Pay at Store";
  // Fail closed on a missing/unsupported mode: /payment is a public route, so
  // a deep link or an outlet switch while checkout was open must not authorise
  // a payment on a guessed mode. A resumed order carries its own mode.
  const fulfillmentSupported = resume
    ? true
    : !!activeStore && !!fulfillment && storeSupportsFulfillment(activeStore, fulfillment);
  const fulfillmentBlockMessage = !billingStore
    ? "Choose an outlet to continue."
    : !billingFulfillment
      ? "Choose how you'd like this order: delivery, takeaway or dine-in."
      : "This outlet is not offering your selected order type right now.";

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
                {totals && quoteView.showTotal ? formatINR(finalPayable) : "—"}
              </span>
            </div>
            <AppButton
              size="lg"
              className="flex-1 max-w-[280px] h-12 rounded-xl text-base font-bold shadow-md shadow-primary/20 active:scale-[0.98] transition-transform"
              onClick={() => void startPayment()}
              loading={busy && !payBlocked}
              disabled={
                !fulfillmentSupported ||
                grandTotal <= 0 ||
                !isOnline ||
                payBlocked ||
                !quoteView.payEnabled
              }
              title={
                !fulfillmentSupported
                  ? !fulfillment
                    ? "Choose a fulfillment method"
                    : fulfillmentBlockMessage
                  : !quoteView.payEnabled
                    ? (quoteView.message ?? "Getting delivery price")
                    : storeNotLinked
                      ? failure?.message
                      : payBlocked
                        ? "We are confirming your payment — please do not pay again"
                        : !isOnline
                          ? "Back online to place your order"
                          : totalsFailed
                            ? "Couldn't compute your bill — retry above"
                            : totals === null
                              ? "The bill is still being computed"
                              : undefined
              }
              iconLeft={
                (method === "online" || resume) && !payBlocked ? (
                  <Lock className="h-4 w-4" />
                ) : undefined
              }
            >
              {!fulfillmentSupported
                ? "Choose fulfillment"
                : !quoteView.payEnabled
                  ? quoteView.storeNotLinked
                    ? "Ordering unavailable"
                    : quoteView.status === "idle" || quoteView.status === "loading"
                      ? isDelivery
                        ? "Getting delivery price"
                        : "Getting your order price"
                      : isDelivery
                        ? "Delivery unavailable"
                        : "Price unavailable"
                  : storeNotLinked
                    ? "Ordering unavailable"
                    : payBlocked
                      ? "Payment under review"
                      : status === "failed" || status === "cancelled"
                        ? resume
                          ? "Retry payment"
                          : "Retry checkout"
                        : method === "online" || resume
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
        {!fulfillmentSupported && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-large)] border border-warning/40 bg-warning/10 p-4 type-body-medium text-warning-text"
          >
            <span>{fulfillmentBlockMessage}</span>
            <button
              type="button"
              onClick={() => void navigate({ to: "/checkout" })}
              className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-warning/20 px-4 type-button-sm transition-colors hover:bg-warning/30"
            >
              Review Checkout
            </button>
          </div>
        )}
        {/* Step 1: Payment Method Selection. A resumed order already chose
            online payment on the server, so offering "cash" here would mint a
            second order — the method is fixed to online for that screen. */}
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
              {resume
                ? "This order is unpaid. Finish it online — the amount below is what your order costs."
                : "Select a secure business payment option below."}
            </Text>
          </div>
          {resume ? (
            <div className="flex items-center gap-3 rounded-2xl border border-primary bg-primary/5 p-4 ring-1 ring-primary/30">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary text-white">
                <CreditCard className="h-6 w-6" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <Text variant="titleMedium" className="font-semibold leading-snug text-primary-text">
                  Pay Online
                </Text>
                <Text variant="bodyMedium" tone="secondary" className="mt-1 leading-relaxed">
                  Fast &amp; secure payment via UPI, Cards, NetBanking or Wallets
                </Text>
              </div>
            </div>
          ) : (
            <PaymentMethodList value={method} onChange={setMethod} disabled={busy} />
          )}
        </section>

        {/* Secure badge */}
        <SecurePaymentBadge />

        {/* R8: live quote state. PAY is disabled until the server quotes this
            order; an unavailable address offers takeaway instead. */}
        {quoteView.message && !quoteView.payEnabled && (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4"
          >
            <Text variant="bodyMedium" className="font-bold">
              {quoteView.message}
            </Text>
            <span className="flex items-center gap-2">
              {quoteView.canRetry && (
                <AppButton size="sm" onClick={() => void refreshQuote()}>
                  Retry
                </AppButton>
              )}
              {isDelivery && quoteView.takeawaySelectable && (
                <AppButton
                  size="sm"
                  variant="outlined"
                  onClick={() => void navigate({ to: "/checkout" })}
                >
                  Switch to Takeaway
                </AppButton>
              )}
            </span>
          </div>
        )}

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
                  {billingStore?.name ?? "Store not selected"}
                </Text>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Text variant="caption" tone="secondary">
                    {billingStore?.area}
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
                    {billingFulfillment === "dinein" ? "Dine-in" : billingFulfillment}
                  </AppBadge>
                </div>
              </div>
            </div>

            {/* Address SNAPSHOT */}
            {isDelivery && billingAddress && (
              <div className="py-4 flex items-start gap-3">
                <MapPin className="h-5 w-5 text-text-secondary mt-0.5 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <Text variant="caption" tone="secondary" className="block">
                    Delivery Address
                  </Text>
                  <Text variant="bodyMedium" className="font-semibold text-text capitalize">
                    {billingAddress.label === "other"
                      ? (billingAddress.customLabel ?? "Other")
                      : billingAddress.label}
                  </Text>
                  <p className="text-sm text-text-secondary mt-1">
                    {billingAddress.contactName} ({billingAddress.contactPhone})
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5 leading-normal">
                    {[
                      billingAddress.line1,
                      billingAddress.line2,
                      billingAddress.landmark ? `Near ${billingAddress.landmark}` : null,
                      `${billingAddress.city} - ${billingAddress.pincode}`,
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

            {/* Cart Items List — the order's own lines when resuming. */}
            <div className="py-4">
              <div className="mb-2 flex items-center justify-between">
                <Text variant="titleMedium" className="font-bold">
                  Order Summary ({billingItemCount}{" "}
                  {billingItemCount === 1 ? "item" : "items"})
                </Text>
                {resume ? (
                  <span className="type-label-large text-text-secondary">
                    From this order
                  </span>
                ) : (
                  <Link to="/cart" className="type-label-large text-primary hover:underline">
                    Edit Cart
                  </Link>
                )}
              </div>
              <ReviewItemsList lines={billingLines} />
            </div>

            {/* Applied Promos */}
            {billingPromo && totals && totals.promoDiscount > 0 && (
              <div className="py-3.5 flex items-center justify-between bg-emerald-500/5 -mx-5 px-5">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <Tag className="h-4 w-4 shrink-0" aria-hidden />
                  <Text variant="bodyMedium" className="font-bold">
                    Code: {billingPromo.code}
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
                {method === "online" || resume ? (
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
                  <SummaryRow label="Incl. GST (5%)" value={totals.taxes} />

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
              Demo payments: no live Razorpay key is configured, so online payment will simulate and
              then fail verification — no money moves. Use cash, or configure keys.
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
                code={failure?.code}
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
          if (!open) {
            quoteRepricePrompt.current = false;
            setRepricePrompt(null);
          }
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
          const serverOrder = pendingGatewayOrder.current;
          if (!serverOrder) {
            // Only a quote-refusal prompt may re-create. A normal reprice
            // prompt whose order was already consumed must do nothing (CUS-07:
            // a second tap can never open a second checkout).
            if (!quoteRepricePrompt.current) {
              setRepricePrompt(null);
              return;
            }
            // R8 409 recovery: no gateway order exists yet. Accept the
            // re-quoted total and start a fresh create against the new quote
            // (the repository reuses the same internal order id).
            quoteRepricePrompt.current = false;
            acceptedServerAmount.current = repricePrompt.authoritative;
            setAcceptedServerTotal(repricePrompt.authoritative);
            setRepricePrompt(null);
            payInFlight.current = false;
            setStatus("idle");
            void startPayment();
            return;
          }
          // Nothing created ⇒ nothing to open: never charge an amount the
          // server never quoted.
          if (payInFlight.current) return;
          // Accept this exact server total, then CONTINUE with the order that
          // already exists (CUS-09): the internal `orders/{id}` document and
          // this Razorpay order. No place-order re-run, no second write.
          acceptedServerAmount.current = repricePrompt.authoritative;
          setAcceptedServerTotal(repricePrompt.authoritative);
          pendingGatewayOrder.current = null; // consumed: one open per order
          setRepricePrompt(null);
          payInFlight.current = true;
          setPreflightIssue(null);
          setFailure(null);
          void openGatewayForOrder(serverOrder);
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
  code,
  paymentId,
  onRetry,
  onBackToCheckout,
  onCancel,
  onContactSupport,
}: {
  status: string;
  message: string;
  retryable: boolean;
  code?: string;
  paymentId?: string;
  onRetry: () => void;
  onBackToCheckout: () => void;
  onCancel: () => void;
  onContactSupport: () => void;
}) {
  // Copy/CTA decisions come from describePaymentFailure (unit-tested): the
  // paid-but-no-order branch must NEVER say "no money has been charged" or
  // offer Retry (double-charge). It shows the payment id + support.
  const content = describePaymentFailure({ status, message, retryable, code });
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
            {!retryable && paymentId && (
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
