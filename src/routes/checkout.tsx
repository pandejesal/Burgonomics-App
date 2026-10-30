import * as React from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import {
  MapPin,
  Clock,
  ShoppingBag,
  Pencil,
  Lock,
  ChevronRight,
  ArrowLeft,
  CheckCircle2,
  Bike,
  Store as StoreIcon,
  Utensils,
  ShieldCheck,
  CreditCard,
  Sparkles,
  Timer,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { AppShell } from "@/shared/layouts/AppShell";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { Skeleton } from "@/shared/components/feedback/Skeleton";
import { useHydrated } from "@/shared/hooks/useHydrated";
import { useKitchenHours } from "@/shared/hooks/useKitchenHours";
import { KitchenClosedBanner } from "@/shared/components/feedback/KitchenClosedBanner";
import { KITCHEN_CLOSED_MESSAGE } from "@/core/constants/operatingHours";
import { formatINR } from "@/core/utils/format";
import { ConfirmDialog } from "@/shared/components/common/ConfirmDialog";
import { needsRepriceAcceptance } from "@/features/checkout/utils/repriceAcceptance";
import { hasUnreviewedLegacyNotes } from "@/features/checkout/utils/orderNotes";
import { useAppConfig } from "@/core/state/appConfigStore";
import { HapticService } from "@/core/services/haptics";
import { AudioService } from "@/core/services/audio";
import { toUserMessage } from "@/core/errors/userMessages";
import { cn } from "@/lib/utils";

import {
  cartRepository,
  useCartStore,
  selectItemCount,
  PromoInput,
} from "@/features/cart";
import type { CartTotals } from "@/features/cart/models";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useAuthStore, selectIsAuthenticated } from "@/features/auth/state/authStore";
import { DEFAULT_DELIVERY_RADIUS_KM } from "@/features/stores/utils/serviceArea";
import {
  useCheckoutStore,
  AddressSelector,
  FulfillmentDetailsCard,
  PaymentMethodSelector,
  calculateHaversineKm,
} from "@/features/checkout";
import { useAddressStore, selectAddresses, selectSelectedAddress } from "@/features/addresses";
import {
  usePaymentStore,
  paymentRepository,
  razorpayAdapter,
} from "@/features/payments";
import type { PaymentMethod, PaymentResult } from "@/features/payments/models";
import {
  describePaymentRecovery,
  isRecoveryReason,
  resolveVerifyOutcome,
  type RecoveryReason,
} from "@/features/payments/utils/paymentRecovery";
import { PaymentRecoveryPanel } from "@/features/payments/components/PaymentRecoveryPanel";
import {
  loadPaymentReconciliation,
  persistPaymentReconciliation,
  clearPaymentReconciliation,
  hydratePaymentReconciliation,
} from "@/features/payments/state/paymentStore";
import { orderRepository, type PaymentDisplayStatus } from "@/features/orders";
import { QuickAuthSheet } from "@/features/checkout/components/QuickAuthSheet";

/**
 * P1-14: order/payment failures arrive in two flavours. `ordersService` and
 * `PaymentRepository` return copy written for customers — MISSING_AUTH,
 * AUTH_CHANGED, PERSIST_FAILED ("…the kitchen never received it…") and
 * PAYMENT_RECONCILIATION_PENDING ("Do not pay again.") — while
 * `CartRepository`'s pricing catch and `paymentsService`'s transport catch
 * wrap raw exception text in `PRICING_CALCULATION_ERROR` / `GATEWAY_ERROR`.
 * Only the curated codes below pass through verbatim; every other code is
 * logged and mapped, so raw exception text can never reach the alert box or
 * a toast.
 */
const CURATED_ORDER_FAILURE_CODES = new Set([
  "MISSING_AUTH",
  "MISSING_CONTEXT",
  "AUTH_CHANGED",
  "PERSIST_FAILED",
  "PAYMENT_RECONCILIATION_PENDING",
  "INVALID_AMOUNT",
  // Money-time refusals from the pricing engine. Their messages are static,
  // customer-readable sentences (the only interpolation is the item name), so
  // passing them verbatim tells the customer WHICH item to remove instead of
  // collapsing to a generic "something went wrong".
  "ITEM_UNAVAILABLE",
  "ITEM_PRICE_UNVERIFIED",
]);

/**
 * True when the gateway must NOT open yet: the server's validated total differs
 * from what the customer was shown and they have not accepted that exact figure.
 * Implementation lives in a DOM-free module so it is unit-testable.
 */

function orderFailureMessage(error: { code: string; message: string }): string {
  if (CURATED_ORDER_FAILURE_CODES.has(error.code)) return error.message;
  console.error("[checkout] order/payment failure:", error);
  return toUserMessage(error);
}

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — Burgonomics (100% Pure Vegetarian)" },
      { name: "description", content: "Review fulfillment, delivery address, and complete your Burgonomics order securely." },
    ],
  }),
  component: CheckoutPage,
});

export function CheckoutPage() {
  const navigate = useNavigate();
  const hydrated = useHydrated();

  const lines = useCartStore((s) => s.lines);
  const promo = useCartStore((s) => s.promo);
  const itemCount = useCartStore(selectItemCount);
  const priceLockExpiresAt = useCartStore((s) => s.priceLockExpiresAt);

  const activeStore = useStoreSelection((s) => s.activeStore);
  const fulfillment = useStoreSelection((s) => s.fulfillment);
  const setFulfillment = useStoreSelection((s) => s.setFulfillment);

  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const user = useAuthStore((s) => s.user);

  const orderNotes = useCheckoutStore((s) => s.orderNotes);
  const legacyOrderNotes = useCheckoutStore((s) => s.legacyOrderNotes);
  const tableNumber = useCheckoutStore((s) => s.tableNumber ?? "");
  const setTableNumber = useCheckoutStore((s) => s.setTableNumber ?? (() => {}));
  
  const addresses = useAddressStore(selectAddresses);
  const selectedAddress = useAddressStore(selectSelectedAddress);
  const selectAddress = useAddressStore((s) => s.select);

  const paymentMethod = usePaymentStore((s) => s.method);
  const reconciliationPending = usePaymentStore((s) => s.reconciliationPending);
  // Hydrate unresolved reconciliation (reload-safe) for the CURRENT auth scope.
  // `user?.id` is a dependency (not a mount-only read) so an in-tab account
  // switch re-hydrates instead of leaving the previous account's state behind.
  React.useEffect(() => {
    hydratePaymentReconciliation(user?.id ?? null);
  }, [user?.id]);
  const setPaymentMethod = usePaymentStore((s) => s.setMethod);
  const setPaymentStatus = usePaymentStore((s) => s.setStatus);
  const setPaymentFailure = usePaymentStore((s) => s.setFailure);
  const setPaymentOrder = usePaymentStore((s) => s.setOrder);
  const setPaymentVerification = usePaymentStore((s) => s.setVerification);
  const paymentFailure = usePaymentStore((s) => s.failure);
  const payStatus = usePaymentStore((s) => s.status);
  const reconciliationReason = usePaymentStore((s) => s.reconciliationReason);
  const paymentGatewayOrderId = usePaymentStore((s) => s.gatewayOrderId);
  // Post-gateway recovery state (A08 B9): rendered while the pay button is
  // blocked, so the customer sees payment id + do-not-pay-again + support
  // instead of a dead button and a toast.
  const recoveryReason: RecoveryReason | null =
    reconciliationPending && isRecoveryReason(reconciliationReason)
      ? reconciliationReason
      : payStatus === "waiting" && paymentFailure && isRecoveryReason(paymentFailure.code)
        ? paymentFailure.code
        : null;

  const [totals, setTotals] = React.useState<CartTotals | null>(null);
  // The cart total is a CLIENT estimate; the gateway is opened with the
  // SERVER's validated amount. When they differ the customer must see the
  // authoritative figure and accept it before any money screen opens.
  const [repricePrompt, setRepricePrompt] = React.useState<{
    displayed: number;
    authoritative: number;
  } | null>(null);
  // The server total already accepted, so re-entry does not loop on the same
  // difference (the divergence is structural, not a one-off).
  const acceptedServerAmount = React.useRef<number | null>(null);
  // Fail-closed billing: when the totals computation fails (e.g. no store
  // pricing available), PAY must stay disabled instead of charging ₹0.
  const [totalsFailed, setTotalsFailed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  // Loop 11: synchronous re-entry guard — setBusy is async, so rapid
  // double-tap fires handlePlaceOrder twice (double order creation) before
  // the disabled button re-renders. Ref flips synchronously: no double fire.
  const placeOrderInFlight = React.useRef(false);
  // Finding 5: the post-auth retry is deferred 300ms; hold the timer id so
  // unmount can cancel it, and route the call through the latest
  // `handlePlaceOrder` so the deferred execution sees fresh auth/guest state
  // instead of the render-scope closure captured when the sheet succeeded.
  const authRetryTimer = React.useRef<number | null>(null);
  const handlePlaceOrderRef = React.useRef<() => Promise<void>>(async () => {});
  React.useEffect(() => {
    handlePlaceOrderRef.current = handlePlaceOrder;
  });
  React.useEffect(
    () => () => {
      if (authRetryTimer.current !== null) window.clearTimeout(authRetryTimer.current);
    },
    [],
  );
  // Offline gate: the banner promises checkout is disabled offline — enforce
  // it. Tapping PAY offline used to fire Razorpay into a generic failure.
  const isOnline = useAppConfig((s) => s.isOnline);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [authSheetOpen, setAuthSheetOpen] = React.useState(false);
  // Kitchen-hours gate: PAY must lock itself at 23:00 IST even if this screen
  // has been sitting open since noon (the hook re-checks on tick + focus).
  const kitchen = useKitchenHours();
  // The tip chosen on the cart is still a real charge. Loyalty redemption was
  // withdrawn (D31–D33): the checkout screen no longer offers it, the preview
  // it shows carries zero points, and every payload pins 0 regardless of any
  // legacy persisted value.
  const persistedTip = useCheckoutStore((s) => s.tipAmount);
  const [remainingLockSeconds, setRemainingLockSeconds] = React.useState<number | null>(null);

  // Legacy notes must be reviewed before money can move - including on a
  // direct /checkout deep link. That covers BOTH an oversized inherited order
  // note AND per-item notes carried by the current cart: neither is deleted or
  // silently passed through.
  const linesWithLegacyNotes = lines.filter((line) => (line.notes ?? "").trim().length > 0);
  const legacyNotesPending = hasUnreviewedLegacyNotes(legacyOrderNotes, lines);
  // The two review reasons read differently to the customer, so the alert
  // below must not claim "longer than 240 characters" for an item note.
  const legacyDraftPending = legacyOrderNotes.trim().length > 0;
  const lineNotesPending = linesWithLegacyNotes.length > 0;

  // Outlet/account lifecycle fence for the note draft (shared with the cart).
  const uid = user?.id ?? null;
  const storeId = activeStore?.id ?? null;
  React.useEffect(() => {
    useCheckoutStore.getState().bindNotesScope(uid, storeId);
  }, [uid, storeId]);

  // 10-Minute Price Lock Countdown Timer (honest: no lock => no banner)
  React.useEffect(() => {
    if (!priceLockExpiresAt) {
      setRemainingLockSeconds(null);
      return;
    }
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.floor((priceLockExpiresAt - Date.now()) / 1000));
      setRemainingLockSeconds(remaining);
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [priceLockExpiresAt]);

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const recompute = React.useCallback(async () => {
    const res = await cartRepository.calculateTotals();
    if (res.success) {
      setTotals(res.data);
      setTotalsFailed(false);
    } else {
      // M3 fail-closed: a stale bill priced for the previous fulfillment /
      // promo must not stay on screen behind a live PAY. Log the raw failure
      // (never customer copy) and drop the stale totals.
      console.error("[checkout] totals recompute failed:", res.error);
      setTotalsFailed(true);
      setTotals(null);
    }
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    void recompute();
  }, [hydrated, lines, fulfillment, promo, recompute]);

  if (!hydrated) {
    return (
      <AppShell title="Checkout" backTo="/cart" showTabs={false} showTopBar>
        <div className="mx-auto max-w-[520px] p-4 space-y-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  if (lines.length === 0) {
    return (
      <AppShell title="Checkout" backTo="/cart" showTabs={false} showTopBar>
        <EmptyState
          icon={<ShoppingBag className="h-8 w-8 text-primary" />}
          title="Your cart is empty"
          description="Add some delicious 100% Pure Veg burgers before checking out."
          actionLabel="Browse menu"
          onAction={() => navigate({ to: "/menu" })}
        />
      </AppShell>
    );
  }

  const isDelivery = fulfillment === "delivery";
  const isTakeaway = fulfillment === "takeaway";
  const isDineIn = fulfillment === "dinein";

  const rawGrandTotal = totals?.grandTotal ?? 0;
  // The delivery tip is a real charge: the server reprices with the same
  // `tipAmount` this screen reads, so it must already sit inside To Pay —
  // otherwise checkout quotes less than the gateway collects.
  const finalPayable = Math.max(0, rawGrandTotal + persistedTip);

  // Hoisted so the ref-sync effect also runs safely on the initial skeleton
  // render, which returns before the checkout body is initialized.
  async function handlePlaceOrder() {
    setValidationError(null);

    const uid = useAuthStore.getState().user?.id ?? null;
    const pendingRecon = usePaymentStore.getState().reconciliationPending || !!loadPaymentReconciliation(uid);
    if (pendingRecon) {
      setBusy(false);
      placeOrderInFlight.current = false;
      setPaymentStatus("waiting");
      toast.info("Payment already received — order sync pending", {
        description: "Do not pay again. We are reconciling your order.",
      });
      return;
    }

    // Belt-and-braces behind the disabled button: never fire Razorpay offline.
    if (!useAppConfig.getState().isOnline) {
      setValidationError("You are offline. Reconnect to place your order — your cart is saved.");
      return;
    }

    // Same for the kitchen window: a screen left open past 23:00 must not
    // send a payment for an order the kitchen can no longer accept.
    if (!kitchen.isOpen) {
      setValidationError(KITCHEN_CLOSED_MESSAGE);
      return;
    }

    // An unresolved oversized note (saved by an older build) blocks payment —
    // even on a direct /checkout entry with no cart visit. It is reviewed in
    // the cart; this screen never edits it.
    if (legacyNotesPending) {
      setValidationError(
        "A saved cooking note needs review before you can pay. Open the cart to shorten or discard it.",
      );
      return;
    }

    // Guest check -> In-place frictionless Auth Sheet
    if (!isAuthenticated) {
      void HapticService.selection();
      setAuthSheetOpen(true);
      return;
    }

    if (isDelivery && !selectedAddress) {
      setValidationError("Please select or add a delivery address.");
      toast.error("Please add a delivery address.");
      void navigate({ to: "/profile/addresses" });
      return;
    }

    // Loop: dine-in without a table number used to sail through, and KDS
    // rendered a fabricated "Table 01" (food misrouted). Require it.
    if (isDineIn && !tableNumber.trim()) {
      setValidationError("Please enter your table number so the kitchen knows where to serve.");
      toast.error("Table number is required for dine-in.");
      return;
    }

    // Geofence check if Delivery mode. NaN coords used to sail through:
    // `NaN > radius` is false, so corrupt addresses bypassed the zone block.
    // Loop 34/120: a missing pin no longer fabricates a nearby point
    // (store + 0.015 auto-passed) — unverifiable location blocks delivery
    // with a re-pin prompt instead of a fake pass.
    if (isDelivery && selectedAddress && activeStore) {
      const userLat = Number(selectedAddress.lat);
      const userLng = Number(selectedAddress.lng);
      const storeLat = Number(activeStore.lat);
      const storeLng = Number(activeStore.lng);
      if (![userLat, userLng, storeLat, storeLng].every(Number.isFinite)) {
        setValidationError("This address has no verified location. Open Manage Addresses above, edit this address, and drag the pin on the map to verify it.");
        toast.error("Address location is missing. Re-pin it on the map from Manage Addresses.");
        return;
      }
      const dist = calculateHaversineKm(userLat, userLng, storeLat, storeLng);
      const docRadiusKm = activeStore.deliveryRadiusKm;
      if (dist > (docRadiusKm ?? DEFAULT_DELIVERY_RADIUS_KM)) {
        setValidationError(
          `This address is ${dist} km away, which exceeds ${docRadiusKm != null ? `our ${docRadiusKm} km delivery zone` : "our delivery zone"}. Please switch to Takeaway.`
        );
        toast.error("Address is outside delivery range.");
        return;
      }
    }

    // Sync re-entry guard (see declaration): a second tap before re-render
    // must not create a second order.
    if (placeOrderInFlight.current) return;
    setBusy(true);
    placeOrderInFlight.current = true;

    // Capture the note draft BEFORE any async work. A draft written after this
    // instant (same account and outlet included) is NEWER and must survive the
    // completion of this order.
    const notesDraftMark = useCheckoutStore
      .getState()
      .captureNotesDraft(
        useAuthStore.getState().user?.id ?? null,
        useStoreSelection.getState().activeStore?.id ?? null,
      );

    // 1. Cart preflight validation
    const validation = await cartRepository.validateCart();
    if (!validation.success || !validation.data.valid) {
      setBusy(false);
      placeOrderInFlight.current = false;
      // Curated cart-issue copy passes through; the failure branch is typed
      // raw-capable (CartRepository), so it is logged + mapped, never shown.
      if (!validation.success) console.error("[checkout] cart validation failed:", validation.error);
      const msg = validation.success
        ? (validation.data.issues[0]?.message ?? "Some items in your cart are no longer available.")
        : toUserMessage(validation.error);
      setValidationError(msg);
      toast.error(msg);
      return;
    }

    // D31–D33: redemption withdrew from the customer app. Pin the persisted
    // value to 0 before any create call so a legacy localStorage choice can
    // never reach an order, a coupon reprice, or the gateway payload.
    useCheckoutStore.getState().setLoyaltyPointsToRedeem(0);

    // The note draft belongs to the account/outlet that placed the order; it is
    // cleared only after success, only while it is still the exact draft
    // (`notesDraftMark`) captured above.
    // 2. Cash on Delivery / Pay at Counter Flow
    if (paymentMethod === "cash") {
      try {
        const orderStatus: PaymentDisplayStatus = isDelivery ? "CASH_PENDING" : "PAY_AT_STORE";
        const paymentLabel = isDelivery ? "Cash on Delivery" : isTakeaway ? "Pay at Pickup Counter" : "Pay at Dine-In Counter";

        const created = await orderRepository.createFromCurrentContext({
          paymentMethod: "cash",
          paymentStatus: orderStatus,
          paymentLabel,
        });

        setBusy(false);
      placeOrderInFlight.current = false;
        if (!created.success) {
          const message = orderFailureMessage(created.error);
          setValidationError(message);
          toast.error("Could not place order", { description: message });
          return;
        }

        AudioService.playSuccess();
        void HapticService.notification("success");
        // D31–D33: no loyalty balance refresh — balances/ledger are server-owned
        // and the customer app no longer presents them.
        void cartRepository.clear();
        useCheckoutStore.getState().clearNotesAfterCompletedOrder(notesDraftMark);
        void navigate({
          to: "/orders/$orderId/track",
          params: { orderId: created.data.id },
          replace: true,
        });
      } catch (err) {
        setBusy(false);
      placeOrderInFlight.current = false;
        // Raw exception text never reaches the red alert box (P1-8).
        console.error("[checkout] cash order exception:", err);
        const msg = "We couldn't place your order. Please try again.";
        setValidationError(msg);
        toast.error("Could not place order", { description: msg });
      }
      return;
    }

    // 3. Online Razorpay Flow
    // Free-order branch (cash already returned above): promo + loyalty
    // covering the full bill must NOT touch the gateway (Razorpay rejects
    // ₹0; payment.tsx blocks it too).
    if (finalPayable <= 0) {
      try {
        const free = await orderRepository.createFromCurrentContext({
          paymentMethod: "online",
          paymentStatus: "paid",
          paymentLabel: "Paid Online (₹0)",
        });
        setBusy(false);
        placeOrderInFlight.current = false;
        if (!free.success) {
          const message = orderFailureMessage(free.error);
          setValidationError(message);
          toast.error("Could not place order", { description: message });
          return;
        }
        AudioService.playSuccess();
        void HapticService.notification("success");
        void cartRepository.clear();
        useCheckoutStore.getState().clearNotesAfterCompletedOrder(notesDraftMark);
        void navigate({
          to: "/orders/$orderId/track",
          params: { orderId: free.data.id },
          replace: true,
        });
      } catch (err) {
        setBusy(false);
        placeOrderInFlight.current = false;
        // Raw exception text never reaches the red alert box (P1-8).
        console.error("[checkout] free order exception:", err);
        const msg = "We couldn't place your order. Please try again.";
        setValidationError(msg);
        toast.error("Could not place order", { description: msg });
      }
      return;
    }
    try {
      setPaymentStatus("preparing");
      setPaymentFailure(null);
      const orderRes = await paymentRepository.createPaymentOrder({
        loyaltyPointsToRedeem: 0,
      });
      if (!orderRes.success) {
        setBusy(false);
      placeOrderInFlight.current = false;
        setPaymentStatus("failed");
        const message = orderFailureMessage(orderRes.error);
        setPaymentFailure({
          code: orderRes.error.code,
          message,
          // A reconciliation block is not retryable: retrying there would
          // start a second payment for money the server already has.
          retryable: orderRes.error.code !== "PAYMENT_RECONCILIATION_PENDING",
        });
        setValidationError(message);
        toast.error("Couldn't initiate online payment", { description: message });
        return;
      }

      // Server total wins, but never silently: the sheet would otherwise open
      // on a different number than the one the customer just reviewed. No rate
      // is invented here and no fee is sent - we only surface the authoritative
      // total and require acceptance when it changed.
      const displayedTotal = totals?.grandTotal;
      const authoritativeTotal =
        typeof orderRes.data.amount === "number" ? orderRes.data.amount : undefined;
      if (
        needsRepriceAcceptance(
          displayedTotal,
          authoritativeTotal,
          acceptedServerAmount.current
        )
      ) {
        setBusy(false);
        placeOrderInFlight.current = false;
        setRepricePrompt({
          // The gate only returns true when both are finite numbers.
          displayed: displayedTotal as number,
          authoritative: authoritativeTotal as number,
        });
        return;
      }

      setPaymentOrder(orderRes.data);
      setPaymentStatus("waiting");

      await razorpayAdapter.initialize({ order: orderRes.data });
      await razorpayAdapter.openCheckout(
        {
          onSuccess: async (result: PaymentResult) => {
            try {
              const verify = await paymentRepository.verifyPayment(result);
              if (verify.success && verify.data.verified) {
                // proceed to order finalization below
              } else if (!verify.success && verify.error.code === "TRANSFER_IN_PROGRESS") {
                setBusy(false);
      placeOrderInFlight.current = false;
                const reconUid = useAuthStore.getState().user?.id ?? null;
                usePaymentStore.getState().setReconciliation(true, "TRANSFER_IN_PROGRESS", usePaymentStore.getState().internalOrderId ?? result.internalOrderId ?? null, usePaymentStore.getState().gatewayOrderId ?? result.orderId ?? null);
                persistPaymentReconciliation(reconUid, { internalOrderId: usePaymentStore.getState().internalOrderId ?? result.internalOrderId ?? null, gatewayOrderId: usePaymentStore.getState().gatewayOrderId ?? result.orderId ?? null, reason: "TRANSFER_IN_PROGRESS" });
                setPaymentStatus("waiting");
                const transferCopy = describePaymentRecovery("TRANSFER_IN_PROGRESS");
                setPaymentFailure({
                  code: "TRANSFER_IN_PROGRESS",
                  message: transferCopy.body,
                  retryable: false,
                  paymentId: result.paymentId,
                });
                toast.info(transferCopy.title, {
                  description: `${transferCopy.body}${result.paymentId ? ` Payment ID ${result.paymentId}.` : ""}`,
                });
                return;
              } else if (!verify.success && verify.error.code === "ORDER_TERMINAL") {
                setBusy(false);
      placeOrderInFlight.current = false;
                const reconUid = useAuthStore.getState().user?.id ?? null;
                usePaymentStore.getState().setReconciliation(true, "ORDER_TERMINAL", usePaymentStore.getState().internalOrderId ?? result.internalOrderId ?? null, usePaymentStore.getState().gatewayOrderId ?? result.orderId ?? null);
                persistPaymentReconciliation(reconUid, { internalOrderId: usePaymentStore.getState().internalOrderId ?? result.internalOrderId ?? null, gatewayOrderId: usePaymentStore.getState().gatewayOrderId ?? result.orderId ?? null, reason: "ORDER_TERMINAL" });
                setPaymentStatus("waiting");
                const terminalCopy = describePaymentRecovery("ORDER_TERMINAL");
                setPaymentFailure({
                  code: "ORDER_TERMINAL",
                  message: terminalCopy.body,
                  retryable: false,
                  paymentId: result.paymentId,
                });
                toast.info(terminalCopy.title, {
                  description: `${terminalCopy.body}${result.paymentId ? ` Payment ID ${result.paymentId}.` : ""}`,
                });
                // Captured money: do not markPaymentFailed, do not invite re-pay.
                return;
              } else {
                setBusy(false);
                placeOrderInFlight.current = false;
                const outcome = resolveVerifyOutcome({
                  verify,
                  internalOrderId:
                    usePaymentStore.getState().internalOrderId ?? result.internalOrderId ?? null,
                  gatewayOrderId:
                    usePaymentStore.getState().gatewayOrderId ?? result.orderId ?? null,
                  paymentId: result.paymentId,
                });
                if (outcome.kind === "uncaptured") {
                  // Only a server-proven non-capture may flip the order to
                  // failed — signature failures and unknown codes (503, bad
                  // sig, unverified 200) never reach here (A08 B1).
                  setPaymentStatus("failed");
                  setPaymentFailure({
                    code: outcome.code,
                    message: outcome.message,
                    retryable: outcome.retryable,
                    paymentId: result.paymentId,
                  });
                  toast.error("Payment verification failed", { description: outcome.message });
                  void orderRepository.markPaymentFailed(outcome.internalOrderId).catch(() => undefined);
                  return;
                }
                // "verified" was handled by the branch above; anything else is
                // a reconciliation outcome. Keep the fallthrough fail-closed.
                if (outcome.kind !== "reconciliation") return;
                // Unknown / possibly-captured outcome: persist reconciliation
                // (which disables the pay button) and surface the recovery
                // panel — never a failed state that invites a re-pay (A08 B9).
                const reconUid = useAuthStore.getState().user?.id ?? null;
                usePaymentStore
                  .getState()
                  .setReconciliation(true, outcome.reason, outcome.internalOrderId, outcome.gatewayOrderId);
                persistPaymentReconciliation(reconUid, {
                  internalOrderId: outcome.internalOrderId,
                  gatewayOrderId: outcome.gatewayOrderId,
                  reason: outcome.reason,
                });
                setPaymentStatus("waiting");
                const copy = describePaymentRecovery(outcome.reason);
                setPaymentFailure({
                  code: outcome.reason,
                  message: copy.body,
                  retryable: false,
                  paymentId: result.paymentId,
                });
                toast.info(copy.title, {
                  description: `${copy.body}${result.paymentId ? ` Payment ID ${result.paymentId}.` : ""}`,
                });
                return;
              }
              setPaymentVerification(verify.data);

              const created = await orderRepository.finalizePaidOrder({
                confirmedOrderId: verify.data.confirmedOrderId,
                transactionId: result.paymentId,
              });

              setBusy(false);
              placeOrderInFlight.current = false;
              // Paid-but-no-order is NOT success: money moved, no order record.
              // Never clear the cart or navigate to tracking here — surface the
              // failure with the gateway payment id for support recovery.
              if (!created.success) {
                const reconUid = useAuthStore.getState().user?.id ?? null;
                usePaymentStore.getState().setReconciliation(true, "PAYMENT_SYNC_PENDING", verify.data.confirmedOrderId ?? null, result.orderId ?? null);
                persistPaymentReconciliation(reconUid, { internalOrderId: verify.data.confirmedOrderId ?? null, gatewayOrderId: result.orderId ?? null, reason: "PAYMENT_SYNC_PENDING" });
                setPaymentStatus("waiting");
                setPaymentFailure({
                  code: "PAYMENT_SYNC_PENDING",
                  message: `Payment received (ID ${result.paymentId}); order sync pending. Do not pay again.`,
                  retryable: false,
                  paymentId: result.paymentId,
                });
                toast.info("Payment received — order sync pending", {
                  description: `Payment ID ${result.paymentId}. Our servers have your order. Do not pay again.`,
                });
                return;
              }
              setPaymentStatus("success");
              AudioService.playSuccess();
              void HapticService.notification("success");
              // D31–D33: balances/ledger stay server-owned; nothing to refresh
              // here because the app no longer presents a wallet.
              const reconUid = useAuthStore.getState().user?.id ?? null;
              clearPaymentReconciliation(reconUid);
              usePaymentStore.getState().clearReconciliation();
              void cartRepository.clear();
              useCheckoutStore.getState().clearNotesAfterCompletedOrder(notesDraftMark);
              const orderId = created.success ? created.data.id : verify.data.confirmedOrderId;
              void navigate({
                to: "/orders/$orderId/track",
                params: { orderId },
                replace: true,
              });
            } catch (err) {
              setBusy(false);
              placeOrderInFlight.current = false;
              // Post-gateway unknown exception (verify/finalize threw after
              // money may have moved): persist reconciliation and surface the
              // recovery panel — never a failed state that invites a re-pay,
              // never a cart clear or confirmation navigation (A08 B9).
              console.error("[checkout] post-payment exception:", err);
              const reconUid = useAuthStore.getState().user?.id ?? null;
              const store = usePaymentStore.getState();
              const boundInternal = store.internalOrderId ?? result.internalOrderId ?? null;
              const boundGateway = store.gatewayOrderId ?? result.orderId ?? null;
              store.setReconciliation(true, "PAYMENT_SYNC_PENDING", boundInternal, boundGateway);
              persistPaymentReconciliation(reconUid, {
                internalOrderId: boundInternal,
                gatewayOrderId: boundGateway,
                reason: "PAYMENT_SYNC_PENDING",
              });
              setPaymentStatus("waiting");
              const copy = describePaymentRecovery("PAYMENT_SYNC_PENDING");
              setPaymentFailure({
                code: "PAYMENT_SYNC_PENDING",
                message: copy.body,
                retryable: false,
                paymentId: result.paymentId,
              });
              toast.info(copy.title, {
                description: `${copy.body}${result.paymentId ? ` Payment ID ${result.paymentId}.` : ""}`,
              });
            }
          },
          onFailure: (err) => {
            setBusy(false);
      placeOrderInFlight.current = false;
            setPaymentStatus("failed");
            // P1-8: gateway description text is not customer copy — log raw.
            console.error("[checkout] gateway onFailure:", err);
            toast.error("Payment not completed", { description: "Please try again or choose another payment method." });
          },
          onCancel: () => {
            setBusy(false);
      placeOrderInFlight.current = false;
            setPaymentStatus("cancelled");
            toast.info("Payment cancelled. You can retry when ready.");
          },
        },
        paymentMethod,
      );
    } catch (payErr) {
      setBusy(false);
      placeOrderInFlight.current = false;
      setPaymentStatus("failed");
      // P1-8: raw gateway/exception text never reaches the red alert box —
      // customers get an honest recovery path instead.
      console.error("[checkout] payment initiation failed:", payErr);
      setValidationError(
        "Payment couldn't be completed. Please try again — if your amount was debited, contact support before retrying."
      );
    }
  }

  return (
    <AppShell
      title="Checkout"
      backTo="/cart"
      showTabs={false}
      showTopBar
      bottomSlot={
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-divider bg-surface/95 backdrop-blur-md p-4 shadow-2xl">
          <div className="mx-auto flex max-w-[520px] flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-text-secondary">To Pay</p>
              <p className="type-price whitespace-nowrap text-xl text-text-primary">
                {totals ? formatINR(finalPayable) : "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={handlePlaceOrder}
              disabled={busy || !isOnline || totals === null || totalsFailed || !kitchen.isOpen || reconciliationPending || legacyNotesPending}
              aria-disabled={busy || !isOnline || totals === null || totalsFailed || !kitchen.isOpen || reconciliationPending || legacyNotesPending}
              title={
                reconciliationPending
                  ? "We are confirming your payment — please do not pay again"
                  : legacyNotesPending
                    ? "Review your saved cooking note in the cart first"
                    : !kitchen.isOpen
                      ? KITCHEN_CLOSED_MESSAGE
                      : !isOnline
                        ? "Back online to place your order"
                        : totalsFailed
                          ? "Couldn't compute your bill — retry above"
                          : totals === null
                            ? "Bill is still being computed"
                            : undefined
              }
              className="flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 type-button text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              <Lock className="h-4 w-4 stroke-[2.5px]" />
              <span>
                {reconciliationPending
                  ? "Payment under review"
                  : busy
                    ? "Processing Order..."
                    : !kitchen.isOpen
                      ? "Kitchen closed"
                      : !isOnline
                        ? "Offline — reconnect to pay"
                        : totalsFailed
                          ? "Pay — bill unavailable"
                          : totals === null
                            ? "Pay — checking bill"
                            : `Pay ${formatINR(finalPayable)} securely`}
              </span>
            </button>
          </div>
        </div>
      }
    >
      <div className="mx-auto max-w-[520px] space-y-6 px-4 py-5 pb-36">
        {/* Kitchen closed: browsing stays open, ordering is gated below. */}
        <KitchenClosedBanner />

        {/* Price Lock Banner */}
        {remainingLockSeconds !== null && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-large)] border border-warning/30 bg-warning/10 px-4 py-3 text-warning">
            <div className="flex min-w-0 flex-1 items-start gap-2 type-caption">
              <Timer className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {remainingLockSeconds === 0
                  ? "Price lock expired — rechecked at checkout"
                  : "Checkout price locked"}
              </span>
            </div>
            <span className="type-price shrink-0 text-sm">{formatCountdown(remainingLockSeconds)}</span>
          </div>
        )}

        {validationError && (
          <div role="alert" aria-live="assertive" className="rounded-[var(--radius-large)] border border-error/30 bg-error/10 p-4 type-body-medium text-error">
            {validationError}
          </div>
        )}

        {/* Post-gateway recovery (A08 B9): exact payment id, do-not-pay-again,
            support + existing-order actions while the pay button is blocked. */}
        {recoveryReason && !busy && (
          <PaymentRecoveryPanel
            reason={recoveryReason}
            paymentId={paymentFailure?.paymentId ?? null}
            orderId={paymentGatewayOrderId}
            onContactSupport={() =>
              void navigate({
                to: "/support",
                search: {
                  topic: "payment",
                  paymentId: paymentFailure?.paymentId ?? undefined,
                  message: paymentFailure?.message ?? undefined,
                },
              })
            }
            onCheckOrders={() => void navigate({ to: "/orders" })}
          />
        )}

        {/* Bill unavailable: totals computation failed (e.g. no store pricing).
            PAY stays disabled until recompute succeeds — never charge ₹0. */}
        {totalsFailed && (
          <div role="alert" aria-live="assertive" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-large)] border border-error/30 bg-error/10 p-4 type-body-medium text-error">
            <span>Couldn&apos;t compute your bill. Check your connection and retry.</span>
            <button
              type="button"
              onClick={() => void recompute()}
              className="inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-full bg-error/15 px-4 type-button-sm transition-colors hover:bg-error/25"
            >
              Retry
            </button>
          </div>
        )}

        {/* 1. Fulfillment Mode Details */}
        <FulfillmentDetailsCard
          fulfillment={fulfillment ?? "delivery"}
          store={activeStore}
          selectedAddress={selectedAddress}
          tableNumber={tableNumber}
          onTableNumberChange={(t) => setTableNumber(t)}
        />

        {/* Address Selection with Geofencing (Delivery Mode Only) — Standard Delivery only */}
        {isDelivery && (
          <div className="space-y-4 rounded-[var(--radius-large)] border border-divider bg-surface p-4 sm:p-5">
            <AddressSelector
              addresses={addresses}
              selectedAddress={selectedAddress}
              activeStore={activeStore}
              onSelectAddress={(addr) => selectAddress(addr.id)}
              onSwitchToTakeaway={() => setFulfillment("takeaway")}
            />

            <div className="pt-2 border-t border-divider">
              <div className="flex flex-wrap items-start gap-2.5 rounded-[var(--radius-medium)] border border-primary/30 bg-primary/5 p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-medium)] bg-primary text-primary-foreground">
                  <Bike className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="type-body font-semibold text-text-primary">Standard Delivery</p>
                  <p className="type-caption text-text-secondary">{activeStore?.etaMinutes != null ? `Delivered hot in ~${activeStore.etaMinutes} mins • No scheduling needed` : "Delivered hot • No scheduling needed"}</p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 type-caption font-semibold text-primary-text">
                  ASAP
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 2. Order Review & Cooking Notes */}
        <section className="space-y-4 rounded-[var(--radius-large)] border border-divider bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider pb-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-medium)] bg-primary/10 text-primary-text">
                <ShoppingBag className="h-4 w-4" />
              </div>
              <h2 className="type-title-medium text-text-primary">
                2. Order Review ({itemCount} {itemCount === 1 ? "Item" : "Items"})
              </h2>
            </div>
            <Link to="/cart" className="-mr-2 inline-flex min-h-11 items-center px-2 type-caption font-semibold text-primary-text hover:underline">
              Edit Cart
            </Link>
          </div>

          <div className="space-y-2 divide-y divide-divider/50">
            {lines.map((line) => (
              <div key={line.lineId} className="flex items-start justify-between gap-3 pt-3 first:pt-0 select-none">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <span className="mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[2px] border border-success p-[1px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  </span>
                  <p className="type-body break-words font-medium text-text-primary">
                    <span className="mr-1 font-semibold text-primary-text">{line.quantity}x</span> {line.name}
                  </p>
                </div>
                <span className="type-price shrink-0 whitespace-nowrap text-right text-text-primary">
                  {formatINR(line.unitPrice * line.quantity)}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-divider pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-text">Cooking instructions</p>
              <Link to="/cart" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-text hover:underline">
                Edit in Cart
              </Link>
            </div>
            {legacyDraftPending ? (
              <div role="alert" className="space-y-1 rounded-xl border border-warning/40 bg-warning/10 p-3">
                <p className="text-sm font-medium text-text">
                  Your saved note needs review before payment
                </p>
                <p className="text-sm text-text-secondary">
                  It was saved by an older version and is longer than the 240-character limit.
                  It is not attached to this order. Review it in the cart.
                </p>
                <p className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-sm text-text">
                  {legacyOrderNotes}
                </p>
              </div>
            ) : lineNotesPending ? (
              <div role="alert" className="space-y-1 rounded-xl border border-warning/40 bg-warning/10 p-3">
                <p className="text-sm font-medium text-text">
                  Item notes need review before payment
                </p>
                <p className="text-sm text-text-secondary">
                  Some items still carry a note from an older cart. Move it into the order
                  note or remove it in the cart — it is not attached to this order.
                </p>
              </div>
            ) : orderNotes.trim().length > 0 ? (
              <p className="whitespace-pre-wrap break-words rounded-xl border border-divider bg-bg-secondary p-3 text-sm text-text">
                {orderNotes}
              </p>
            ) : (
              <p className="text-sm text-text-secondary">No cooking instructions added.</p>
            )}
          </div>
        </section>

        {/* 3. Coupons */}
        <section className="space-y-4 rounded-[var(--radius-large)] border border-divider bg-surface p-4 sm:p-5">
          <div className="flex items-center gap-2 border-b border-divider pb-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-medium)] bg-accent/10 text-accent-text">
              <Sparkles className="h-4 w-4" />
            </div>
            <h2 className="type-title-medium text-text-primary">
              3. Coupons
            </h2>
          </div>

          <PromoInput applied={promo} onChanged={() => void recompute()} />

          {/* D31–D33: loyalty balance/redemption UI removed. Server-held
              balances and ledger history are preserved; the client always
              sends zero points. */}
        </section>

        {/* 4. Bill Summary */}
        <section className="space-y-4 rounded-[var(--radius-large)] border border-divider bg-surface p-4 sm:p-5">
          <div className="flex items-center gap-2 border-b border-divider pb-3">
            <h2 className="type-title-medium text-text-primary">
              4. Bill Breakdown
            </h2>
          </div>

          <div className="space-y-2.5 type-caption">
            <div className="flex items-start justify-between gap-3 text-text-secondary">
              <span>Item Total</span>
              <span className="type-price shrink-0 whitespace-nowrap text-right text-text-primary">{totals ? formatINR(totals.subtotal) : <span className="text-warning">unavailable</span>}</span>
            </div>
            <div className="flex items-start justify-between gap-3 text-text-secondary">
              <span>Govt. GST (5% included)</span>
              <span className="type-price shrink-0 whitespace-nowrap text-right text-text-primary">{totals ? formatINR(totals.taxes) : <span className="text-warning">unavailable</span>}</span>
            </div>
            <div className="flex items-start justify-between gap-3 text-text-secondary">
              <span>Restaurant Packaging</span>
              <span className="type-price shrink-0 whitespace-nowrap text-right text-text-primary">
                {isDineIn ? <span className="font-semibold text-success">FREE</span> : totals ? formatINR(totals.packingFee) : <span className="text-warning">unavailable</span>}
              </span>
            </div>
            {/* Delivery Fee — same rule as BillBreakdown: only delivery shows it. */}
            {isDelivery && (
              <div className="flex items-start justify-between gap-3 text-text-secondary">
                <span>Delivery Fee</span>
                <span className="type-price shrink-0 whitespace-nowrap text-right text-text-primary">
                  {totals?.deliveryFee === 0 ? (
                    <span className="font-semibold text-success">FREE</span>
                  ) : totals ? (
                    formatINR(totals.deliveryFee)
                  ) : (
                    <span className="text-warning">unavailable</span>
                  )}
                </span>
              </div>
            )}

            {/* Delivery Partner Tip — chosen on the cart, charged by the server. */}
            {persistedTip > 0 && (
              <div className="flex items-start justify-between gap-3 text-text-secondary">
                <span>Delivery Partner Tip</span>
                <span className="type-price shrink-0 whitespace-nowrap text-right text-text-primary">{formatINR(persistedTip)}</span>
              </div>
            )}

            {totals?.promoDiscount ? (
              <div className="flex items-start justify-between gap-3 font-medium text-success">
                <span>Coupon Discount ({promo?.code ?? "PROMO"})</span>
                <span className="type-price shrink-0 whitespace-nowrap text-right">-{formatINR(totals.promoDiscount)}</span>
              </div>
            ) : null}

            <div className="flex items-start justify-between gap-3 border-t border-divider pt-3 type-title-medium text-text-primary">
              <span>To Pay</span>
              <span className="type-price shrink-0 whitespace-nowrap text-right text-lg text-text-primary">{totals ? formatINR(finalPayable) : "—"}</span>
            </div>
          </div>
        </section>

        {/* 5. Payment Method Selector */}
        <section className="rounded-[var(--radius-large)] border border-divider bg-surface p-4 sm:p-5">
          <PaymentMethodSelector
            selectedMethod={paymentMethod}
            onSelectMethod={(method) => setPaymentMethod(method)}
            isDelivery={isDelivery}
            isTakeaway={isTakeaway}
          />
        </section>
      </div>

      {/* In-Place Frictionless Phone+OTP Authentication Sheet */}
      <QuickAuthSheet
        isOpen={authSheetOpen}
        onClose={() => setAuthSheetOpen(false)}
        onSuccess={() => {
          setAuthSheetOpen(false);
          // Finding 5: never defer a stale closure. The 300ms delay used to
          // capture `handlePlaceOrder` (and its `isAuthenticated` render
          // scope) from BEFORE the auth completed — if the user re-rendered
          // or unmounted meanwhile, the deferred call re-opened this very
          // sheet (stale `false`) or set state on a dead tree. Call through
          // the ref-held latest callback and clear the timer on unmount.
          if (authRetryTimer.current !== null) {
            window.clearTimeout(authRetryTimer.current);
          }
          authRetryTimer.current = window.setTimeout(() => {
            authRetryTimer.current = null;
            void handlePlaceOrderRef.current();
          }, 300);
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
          acceptedServerAmount.current = repricePrompt.authoritative;
          setRepricePrompt(null);
          void handlePlaceOrderRef.current();
        }}
      />
    </AppShell>
  );
}

export default CheckoutPage;
