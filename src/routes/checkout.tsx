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
import { kitchenClosedMessage } from "@/core/constants/operatingHours";
import { formatINR } from "@/core/utils/format";
import { ConfirmDialog } from "@/shared/components/common/ConfirmDialog";
import { needsRepriceAcceptance } from "@/features/checkout/utils/repriceAcceptance";
import { hasUnreviewedLegacyNotes } from "@/features/checkout/utils/orderNotes";
import { useAppConfig } from "@/core/state/appConfigStore";
import { HapticService } from "@/core/services/haptics";
import { AudioService } from "@/core/services/audio";
import { toUserMessage } from "@/core/errors/userMessages";
import { cn } from "@/lib/utils";

import { cartRepository, useCartStore, selectItemCount, PromoInput } from "@/features/cart";
import type { CartTotals } from "@/features/cart/models";
import { useStoreSelection, storeSupportsFulfillment } from "@/features/stores/state/storeStore";
import { useAuthStore, selectIsAuthenticated } from "@/features/auth/state/authStore";
import { DEFAULT_DELIVERY_RADIUS_KM } from "@/features/stores/utils/serviceArea";
import {
  useCheckoutStore,
  useCheckoutFees,
  deliveryQuoteView,
  isDeliveryQuoteRefusal,
  AddressSelector,
  FulfillmentDetailsCard,
  PaymentMethodSelector,
  WhatsappOptInCheckbox,
  calculateHaversineKm,
} from "@/features/checkout";
import { cashOnDeliveryAvailability } from "@/features/checkout/state/checkoutFeesTypes";
import { retirePriceChangedCashAttemptAtomic } from "@/features/payments/services/pendingCashOrder";
import {
  type CompletionScope,
  captureCompletionScope,
  cashSubmissionScope,
  isCompletionScopeValid,
} from "@/features/checkout/state/checkoutCompletionScope";
import {
  useAddressStore,
  selectAddresses,
  selectSelectedAddress,
  addressRepository,
} from "@/features/addresses";
import {
  ADDRESS_LOAD_FAILED_COPY,
  ADDRESS_LOADING_COPY,
  classifyAddressLoad,
} from "@/features/addresses/utils/addressLoadState";
import { usePaymentStore, paymentRepository, razorpayAdapter } from "@/features/payments";
import type { PaymentMethod, PaymentResult } from "@/features/payments/models";
import {
  describePaymentRecovery,
  isRecoveryReason,
  resolveVerifyOutcome,
  type RecoveryReason,
} from "@/features/payments/utils/paymentRecovery";
import { PaymentRecoveryPanel } from "@/features/payments/components/PaymentRecoveryPanel";
import {
  isNonRetryableOrderFailure,
  STORE_NOT_LINKED,
} from "@/features/payments/utils/paymentFailure";
import {
  loadPaymentReconciliation,
  persistPaymentReconciliation,
  clearPaymentReconciliation,
  hydratePaymentReconciliation,
} from "@/features/payments/state/paymentStore";
import { orderRepository } from "@/features/orders";
import { cashPriceChangedPaise } from "@/features/payments/services/cashCheckoutDecision";
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
  "MIN_ORDER",
  // F2 (staging 2026-11-21, Test 9): the outlet is closed. The server's own
  // sentence is what the customer must read, not a generic failure.
  "STORE_CLOSED",
  "COD_UNAVAILABLE",
  "COD_LIMIT_EXCEEDED",
  "ORDER_SYNC_PENDING",
]);

/**
 * R5-B3. Account-only fence for money that may already have moved. A cart or
 * note edit inside the SAME account lifetime is legitimate after verification:
 * the order must still finalize and reconciliation must still be persisted.
 * Only a different uid/session epoch may suppress those writes. The full-scope
 * guard remains for cart/note clearing, reconciliation clearing and navigation.
 */
function isSameAccountIdentity(scope: CompletionScope): boolean {
  const live = captureCompletionScope();
  return live.uid === scope.uid && live.identityEpoch === scope.identityEpoch;
}

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
      {
        name: "description",
        content:
          "Review fulfillment, delivery address, and complete your Burgonomics order securely.",
      },
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
  const isBootstrapped = useAuthStore((s) => s.isBootstrapped);
  const user = useAuthStore((s) => s.user);

  const orderNotes = useCheckoutStore((s) => s.orderNotes);
  const legacyOrderNotes = useCheckoutStore((s) => s.legacyOrderNotes);
  const tableNumber = useCheckoutStore((s) => s.tableNumber ?? "");
  const setTableNumber = useCheckoutStore((s) => s.setTableNumber ?? (() => {}));
  // Owner decision 2026-11-25 #3: WhatsApp order updates are OPT-IN and OFF by
  // default. Only this tick-box turns the flag on, and consent is sent only then.
  const whatsappOptIn = useCheckoutStore((s) => s.whatsappOptIn === true);
  const setWhatsappOptIn = useCheckoutStore((s) => s.setWhatsappOptIn ?? (() => {}));

  const addresses = useAddressStore(selectAddresses);
  const selectedAddress = useAddressStore(selectSelectedAddress);
  const selectAddress = useAddressStore((s) => s.select);

  // CUS-18: checkout reads the ACCOUNT's addresses, not just this browser's
  // localStorage. Only the Manage Addresses screen used to seed the store, so
  // a fresh profile / second device showed "No saved delivery addresses found"
  // for an account that has them. A read in flight and a failed read are their
  // own states — neither is "you have no addresses".
  const [addressLoad, setAddressLoad] = React.useState<{
    loading: boolean;
    error: string | null;
  }>({ loading: true, error: null });
  const [addressReload, setAddressReload] = React.useState(0);
  React.useEffect(() => {
    if (!hydrated || !isBootstrapped) return;
    // Signed-out visitors have no server collection; the local (guest) list is
    // all there is and it needs no read.
    if (!isAuthenticated) {
      setAddressLoad({ loading: false, error: null });
      return;
    }
    let active = true;
    setAddressLoad({ loading: true, error: null });
    // Optional call: isolated view hosts and route test doubles may replace the
    // addresses module wholesale and expose no repository. A missing export
    // from such a double must not crash checkout.
    let seed: ReturnType<typeof addressRepository.hydrate> | undefined;
    try {
      seed = addressRepository?.hydrate?.();
    } catch {
      seed = undefined;
    }
    if (!seed) {
      setAddressLoad({ loading: false, error: null });
      return;
    }
    void seed.then(
      (res) => {
        if (!active) return;
        setAddressLoad({
          loading: false,
          error: res.success ? null : res.error.message,
        });
      },
      () => {
        if (!active) return;
        setAddressLoad({ loading: false, error: ADDRESS_LOAD_FAILED_COPY });
      },
    );
    return () => {
      active = false;
    };
  }, [hydrated, isBootstrapped, isAuthenticated, user?.id, addressReload]);
  const addressLoadState = classifyAddressLoad({
    loading: addressLoad.loading,
    error: addressLoad.error,
    count: addresses.length,
  });
  // The saved-address read has settled into a real answer (an address exists, or
  // the account genuinely has none). Until it has, the card below must not claim
  // "No delivery address selected" — a read in flight or a failed read is not an
  // empty list (CUS-18), and painting that row then removing it was the -41px
  // shift inside the 0.31-0.44 CLS window.
  //
  // Stated as "settled" rather than by listing the unsettled states, so the
  // pending flag cannot drift from `classifyAddressLoad`'s own contract.
  const addressSettled = addressLoadState === "ready" || addressLoadState === "empty";

  // R8: live server quote for delivery + packaging. Quotes on entry and on any
  // change of address/store/fulfillment; stale answers are dropped in the store.
  const { state: feesState, view: quoteView, refresh: refreshQuote } = useCheckoutFees();

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
    // The scope captured at the ACTUAL submission, not a fresh reading when
    // the customer presses Continue. A newer basket/note/session must reject.
    cash?: { attemptId: string; acceptedTotalPaise: number; scope: CompletionScope | null };
  } | null>(null);
  // A confirmed order whose submission scope went stale is terminal: booking
  // it again would create a second order. Show its id and block PAY.
  const [terminalOrderId, setTerminalOrderId] = React.useState<string | null>(null);
  // The server total already accepted, so re-entry does not loop on the same
  // difference (the divergence is structural, not a one-off).
  const acceptedServerAmount = React.useRef<number | null>(null);
  // CUS-11: once the customer accepts the server's total, the To Pay bar must
  // show that figure while Razorpay is open — not the stale client estimate.
  const [acceptedServerTotal, setAcceptedServerTotal] = React.useState<number | null>(null);
  // Fail-closed billing: when the totals computation fails (e.g. no store
  // pricing available), PAY must stay disabled instead of charging ₹0.
  const [totalsFailed, setTotalsFailed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  // Loop 11: synchronous re-entry guard — setBusy is async, so rapid
  // double-tap fires handlePlaceOrder twice (double order creation) before
  // the disabled button re-renders. Ref flips synchronously: no double fire.
  const placeOrderInFlight = React.useRef(false);
  // R5-B4: the submission that currently owns the re-entry guard. A later
  // callback may release `busy`/`placeOrderInFlight` only while it is still this
  // exact submission; once a newer attempt binds, the old one owns nothing.
  const activeSubmission = React.useRef<CompletionScope | null>(null);
  const ownsGuard = (submission: CompletionScope | null) => activeSubmission.current === submission;
  const releaseGuard = (submission: CompletionScope | null) => {
    if (!ownsGuard(submission)) return false;
    setBusy(false);
    placeOrderInFlight.current = false;
    return true;
  };
  // An unsafe retirement must not be followed by an automatic cash replay on
  // the next tap; the customer has to choose a method again explicitly.
  const cashRetirementBlocked = React.useRef(false);
  // Finding 5: the post-auth retry is deferred 300ms; hold the timer id so
  // unmount can cancel it, and route the call through the latest
  // `handlePlaceOrder` so the deferred execution sees fresh auth/guest state
  // instead of the render-scope closure captured when the sheet succeeded.
  const authRetryTimer = React.useRef<number | null>(null);
  const handlePlaceOrderRef = React.useRef<
    (cash?: {
      attemptId: string;
      acceptedTotalPaise: number;
      scope: CompletionScope | null;
    }) => Promise<void>
  >(async () => {});
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
  // D-01: the store is not linked to a partner branch, so the server will
  // always refuse to create a gateway order. Keep PAY disabled instead of
  // inviting a retry that cannot succeed.
  const [orderingUnavailable, setOrderingUnavailable] = React.useState(false);
  // The refusal belongs to the payment path that earned it. A method switch is
  // a new path, so clear it rather than leaving PAY dead forever.
  React.useEffect(() => setOrderingUnavailable(false), [paymentMethod]);
  const [authSheetOpen, setAuthSheetOpen] = React.useState(false);
  // Kitchen-hours gate: PAY must lock itself at 23:00 IST even if this screen
  // has been sitting open since noon (the hook re-checks on tick + focus).
  const kitchen = useKitchenHours();
  // Owner decision 2026-11-25 (#1): the delivery tip is HIDDEN at launch. There
  // is no tip row and no tip in "To Pay"; every order/payment payload pins it
  // off too (see OrderRepository/PaymentRepository). A legacy persisted value
  // is simply ignored, never displayed and never charged.
  const [remainingLockSeconds, setRemainingLockSeconds] = React.useState<number | null>(null);

  // Legacy notes must be reviewed before money can move - including on a
  // direct /checkout deep link. That covers BOTH an oversized inherited order
  // note AND per-item notes carried by the current cart: neither is deleted or
  // silently passed through.
  const linesWithLegacyNotes = lines.filter((line) => (line.notes ?? "").trim().length > 0);
  const legacyNotesPending = hasUnreviewedLegacyNotes(legacyOrderNotes, lines);
  // The two review reasons read differently to the customer, so the alert
  // below must not claim "longer than 240 characters" for an item note.
  const legacyDraftPending = (legacyOrderNotes ?? "").trim().length > 0;
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
  }, [hydrated, lines, fulfillment, promo, recompute, feesState]);

  const rawGrandTotal = totals?.grandTotal ?? 0;
  // Owner decision 2026-11-25 (#1): the delivery tip is HIDDEN at launch, so
  // "To Pay" is the server's own total and carries no tip.
  const finalPayable = Math.max(0, rawGrandTotal);
  // Owner decision 2026-11-26: delivery is Razorpay-only. Counter cash keeps
  // the branch switch/ceiling from the quote; the create route re-checks it.
  const codAvailability = cashOnDeliveryAvailability(
    feesState,
    totals ? Math.round(finalPayable * 100) : null,
    fulfillment,
  );
  // Never leave a customer on a tender the branch refuses: switch the selection
  // back to online as soon as the server says cash is unavailable for this bill.
  // Declared before the loading/empty early returns so hook order is stable.
  React.useEffect(() => {
    if (!codAvailability.allowed && paymentMethod === "cash") {
      setPaymentMethod("upi");
    }
  }, [codAvailability.allowed, paymentMethod, setPaymentMethod]);

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
  // Fail closed when the persisted mode is missing or the selected outlet does
  // not offer it (legacy cache, deep link, or a menu switch that landed while
  // checkout was open). No preflight/order/payment may run on a guessed mode.
  const fulfillmentSupported =
    !!activeStore && !!fulfillment && storeSupportsFulfillment(activeStore, fulfillment);
  const fulfillmentBlockMessage = !activeStore
    ? "Select an outlet to continue."
    : !fulfillment
      ? "Choose how you'd like your order: delivery, takeaway or dine-in."
      : "This outlet is not offering your selected order type right now.";

  // An unlinked outlet refuses ONLINE payment only. Cash/Pay-at-counter is a
  // different path and must stay offerable once the customer switches to it;
  // switching back to online re-offers the attempt (the server answers again).
  const onlineOrderingUnavailable = orderingUnavailable && paymentMethod !== "cash";
  // R8: the server refused the payment because the courier quote was missing or
  // had expired. Re-quote the CURRENT address, then surface the updated figure
  // through the existing price dialog — never open Razorpay on the stale one.
  async function recoverFromQuoteRefusal(submittedScope: CompletionScope | null) {
    const displayed = totals?.grandTotal ?? null;
    const next = await refreshQuote();
    const recomputed = await cartRepository.calculateTotals();
    // R5-B2: this re-quote belongs to the submission that earned the refusal.
    // A cart/note/outlet/session change while it was pending must not publish
    // a price the customer never saw or re-enter payment on newer state.
    if (!submittedScope || !ownsGuard(submittedScope) || !isCompletionScopeValid(submittedScope))
      return;
    if (next.status !== "ready" || !recomputed.success) {
      const message =
        next.status === "unserviceable"
          ? "Delivery isn't available to this address"
          : "We couldn't get an updated delivery price. Please try again.";
      setValidationError(message);
      toast.error(message);
      return;
    }
    setTotals(recomputed.data);
    setTotalsFailed(false);
    // A new quote invalidates any earlier acceptance.
    acceptedServerAmount.current = null;
    if (displayed !== null && recomputed.data.grandTotal !== displayed) {
      setRepricePrompt({ displayed, authoritative: recomputed.data.grandTotal });
      return;
    }
    void handlePlaceOrderRef.current();
  }

  // Hoisted so the ref-sync effect also runs safely on the initial skeleton
  // render, which returns before the checkout body is initialized.
  async function handlePlaceOrder(cash?: {
    attemptId: string;
    acceptedTotalPaise: number;
    scope: CompletionScope | null;
  }) {
    setValidationError(null);
    setOrderingUnavailable(false);

    // Terminal once a real order was confirmed: no second PAY re-arms it.
    if (terminalOrderId) {
      const message = `Order ${terminalOrderId} was placed. Check your orders before paying again.`;
      setValidationError(message);
      toast.error("Order already placed", { description: message });
      setBusy(false);
      placeOrderInFlight.current = false;
      return;
    }

    if (cashRetirementBlocked.current) {
      const message =
        "We couldn't safely update your payment method. Check your orders and try again.";
      setValidationError(message);
      toast.error("Could not place order", { description: message });
      setBusy(false);
      placeOrderInFlight.current = false;
      return;
    }

    if (!fulfillmentSupported) {
      setValidationError(fulfillmentBlockMessage);
      return;
    }

    // Re-read the LIVE selection: the outlet or mode can change after mount
    // (another tab, the store sheet, a menu switch) without this screen
    // re-rendering. Authorising the rendered snapshot would place the order
    // under the wrong mode/outlet.
    const live = useStoreSelection.getState();
    if (live.activeStore?.id !== activeStore?.id || live.fulfillment !== fulfillment) {
      setValidationError("Your checkout details changed — review them before paying.");
      return;
    }
    if (
      !live.activeStore ||
      !live.fulfillment ||
      !storeSupportsFulfillment(live.activeStore, live.fulfillment)
    ) {
      setValidationError(
        live.fulfillment
          ? "Choose how you'd like your order: this outlet is not offering the selected order type."
          : "Choose how you'd like your order: delivery, takeaway or dine-in.",
      );
      return;
    }

    const uid = useAuthStore.getState().user?.id ?? null;
    const pendingRecon =
      usePaymentStore.getState().reconciliationPending || !!loadPaymentReconciliation(uid);
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
      setValidationError(kitchenClosedMessage(kitchen));
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

    // A lost response may already have created an order. Never switch tender
    // or start a parallel checkout while the other server attempt is unresolved.
    // A confirmed receipt observed here belongs to an EARLIER order. Its basket
    // hash excludes notes and it stores no note revision, so it cannot prove
    // ownership of the note draft on screen now. Track the recovery: the cash
    // success path still cleans the SAME basket, but leaves that draft alone.
    // Only a fresh submission owns the mark captured below.
    let confirmedRecovery = false;
    let recoveringZeroDue: boolean;
    try {
      // Keep the WHOLE observation. A confirmed receipt for an older basket is
      // proof of a DIFFERENT order: navigate to that exact id and touch nothing
      // else — no hydration/replay POST, no cart/note cleanup, no tender change.
      // The newer checkout stays exactly as the customer left it.
      const pendingAttempt = orderRepository.pendingCashAttempt();
      if (pendingAttempt?.record.confirmed) {
        confirmedRecovery = true;
        if (!pendingAttempt.matchesBasket) {
          void navigate({
            to: "/orders/$orderId/track",
            params: { orderId: pendingAttempt.record.orderId },
            replace: true,
          });
          return;
        }
      }
      const cashPending = pendingAttempt?.record ?? null;
      recoveringZeroDue = cashPending?.request.zeroDueOnly === true;
      if (paymentMethod !== "cash" && ((cashPending && !cashPending.request.zeroDueOnly) || cash)) {
        setValidationError("Finish your previous checkout before changing payment method.");
        return;
      }
    } catch {
      setValidationError("We couldn't check your previous checkout. Please try again.");
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
        setValidationError(
          "This address has no verified location. Open Manage Addresses above, edit this address, and drag the pin on the map to verify it.",
        );
        toast.error("Address location is missing. Re-pin it on the map from Manage Addresses.");
        return;
      }
      const dist = calculateHaversineKm(userLat, userLng, storeLat, storeLng);
      const docRadiusKm = activeStore.deliveryRadiusKm;
      if (dist > (docRadiusKm ?? DEFAULT_DELIVERY_RADIUS_KM)) {
        setValidationError(
          `This address is ${dist} km away, which exceeds ${docRadiusKm != null ? `our ${docRadiusKm} km delivery zone` : "our delivery zone"}. Please switch to Takeaway.`,
        );
        toast.error("Address is outside delivery range.");
        return;
      }
    }

    // R8: PAY is gated on a live server quote for THIS order type — cash
    // included, because the courier fee is part of what the customer owes.
    // Read fresh from the store: the screen may have sat open past expiry.
    const quoteNow = deliveryQuoteView({
      state: useCheckoutStore.getState().checkoutFees,
      fulfillment,
      hasAddress: Number.isFinite(selectedAddress?.lat) && Number.isFinite(selectedAddress?.lng),
    });
    if (!quoteNow.payEnabled) {
      const message = quoteNow.message ?? "Getting delivery price";
      setValidationError(message);
      toast.error(message);
      if (quoteNow.canRetry || quoteNow.status === "idle" || quoteNow.status === "loading") {
        void refreshQuote();
      }
      return;
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
    // R5-B2: in-memory identity of THIS submission, captured before any await.
    // Every online completion effect rechecks it against the live cart, draft,
    // outlet and account lifetime so a late reply cannot act for a newer
    // checkout. Cash/zero keep their own B1 scope gates below.
    const submittedScope = captureCompletionScope();
    // R5-B4: from here on this exact scope owns the guard until a newer
    // submission replaces it, even while awaits are pending.
    activeSubmission.current = submittedScope;

    // 1. Cart preflight validation
    const validation = await cartRepository.validateCart();
    if (!validation.success || !validation.data.valid) {
      if (!ownsGuard(submittedScope)) return;
      releaseGuard(submittedScope);
      // Curated cart-issue copy passes through; the failure branch is typed
      // raw-capable (CartRepository), so it is logged + mapped, never shown.
      if (!validation.success)
        console.error("[checkout] cart validation failed:", validation.error);
      const msg = validation.success
        ? (validation.data.issues[0]?.message ?? "Some items in your cart are no longer available.")
        : toUserMessage(validation.error);
      setValidationError(msg);
      toast.error(msg);
      return;
    }

    // A Continue replay belongs to the submission that earned the prompt.
    // Revalidate that ORIGINAL scope after the preflight await: a cart/note or
    // session change while it was pending must block the older replay request
    // and preserve the newer state. No POST has happened yet.
    if (cash && (!cash.scope || !isCompletionScopeValid(cash.scope))) {
      if (!ownsGuard(submittedScope)) return;
      releaseGuard(submittedScope);
      const message =
        "Your checkout changed while the updated total was open. Review your basket before continuing.";
      setValidationError(message);
      toast.error("Checkout changed", { description: message });
      return;
    }

    // D31–D33: redemption withdrew from the customer app. Pin the persisted
    // value to 0 before any create call so a legacy localStorage choice can
    // never reach an order, a coupon reprice, or the gateway payload.
    useCheckoutStore.getState().setLoyaltyPointsToRedeem(0);

    // The note draft belongs to the account/outlet that placed the order; it is
    // cleared only after success, only while it is still the exact draft
    // (`notesDraftMark`) captured above.
    // Re-read both tender and mode: a restored cash choice or a mode switch
    // after render must not reach the cash creator for a delivery order.
    const liveFulfillment = useStoreSelection.getState().fulfillment ?? fulfillment;
    // A reconfirmed PRICE_CHANGED total is authoritative; the displayed bill is
    // stale. Use `??` so a valid accepted zero paise is not mistaken for absent.
    const liveCodAvailability = cashOnDeliveryAvailability(
      useCheckoutStore.getState().checkoutFees,
      cash?.acceptedTotalPaise ?? (totals ? Math.round(finalPayable * 100) : null),
      liveFulfillment,
    );
    const liveMethod = usePaymentStore.getState().method;
    // 2. Cash on Delivery / Pay at Counter Flow
    if (liveMethod === "cash" && !recoveringZeroDue && finalPayable > 0) {
      if (!liveCodAvailability.allowed) {
        // Retire under the account lock and wait for the result. If the declined
        // attempt cannot be proven safe to retire, KEEP the cash tender: a
        // switch here could replay an order that may already exist.
        if (cash) {
          const uid = useAuthStore.getState().user?.id ?? null;
          let safe = false;
          try {
            safe = uid
              ? await retirePriceChangedCashAttemptAtomic(
                  uid,
                  cash.attemptId,
                  cash.acceptedTotalPaise,
                )
              : false;
          } catch {
            // Storage/lock rejection: `safe` stays false, so the cleanup below
            // releases busy/in-flight and PAY stays usable.
          }
          if (!safe) {
            if (!ownsGuard(submittedScope)) return;
            cashRetirementBlocked.current = true;
            const message =
              "We couldn't safely update your payment method. Check your orders and try again.";
            setValidationError(message);
            toast.error("Could not place order", { description: message });
            releaseGuard(submittedScope);
            return;
          }
        }
        if (!ownsGuard(submittedScope)) return;
        setPaymentMethod("upi");
        const message = liveCodAvailability.reason ?? "Delivery is paid online only.";
        setValidationError(message);
        toast.error(message);
        releaseGuard(submittedScope);
        return;
      }
      try {
        // Only the cash creation endpoint can price this order and set the
        // server-owned cash channel required by the kitchen admission gate.
        const routeScope = captureCompletionScope();
        const created = await orderRepository.createCashOrder(cash);
        if (!ownsGuard(submittedScope)) return;

        if (!created.success) {
          const paise = cashPriceChangedPaise(created.error);
          const attemptId = created.error.details?.attemptId;
          if (paise !== null && typeof attemptId === "string") {
            setRepricePrompt({
              displayed: totals?.grandTotal ?? 0,
              authoritative: paise / 100,
              cash: {
                attemptId,
                acceptedTotalPaise: paise,
                scope: cashSubmissionScope() ?? captureCompletionScope(),
              },
            });
            return;
          }
          const message = orderFailureMessage(created.error);
          setValidationError(message);
          toast.error("Could not place order", { description: message });
          return;
        }

        // Only the submitted account lifetime/basket/draft may be completed.
        // A changed cart/note or an ended session suppresses every success
        // effect and makes the confirmed receipt terminal: its id is shown,
        // PAY stays blocked, and no cleanup/navigation/reconciliation/tender
        // change is performed.
        // For a Continue replay the prompt-time scope is authoritative. The
        // repository recaptures live state when it takes the account lock; that
        // newer scope belongs to a different checkout and may NEVER authorise
        // cleanup of the request this replay actually sent.
        const submitted = cash ? cash.scope : (cashSubmissionScope() ?? routeScope);
        if (!submitted || !isCompletionScopeValid(submitted)) {
          const message = `Order ${created.data.id} was placed. Check your orders before paying again.`;
          setTerminalOrderId(created.data.id);
          setValidationError(message);
          toast.error("Order already placed", { description: message });
          return;
        }
        AudioService.playSuccess();
        void HapticService.notification("success");
        // D31–D33: no loyalty balance refresh — balances/ledger are server-owned.
        // A recovered receipt proves an EARLIER order, not the current draft:
        // the basket is still ours to clean, the note is not. A fresh
        // submission still clears the exact mark it captured before the POST.
        void cartRepository.clear();
        if (!confirmedRecovery) {
          useCheckoutStore.getState().clearNotesAfterCompletedOrder(notesDraftMark);
        }
        void navigate({
          to: "/orders/$orderId/track",
          params: { orderId: created.data.id },
          replace: true,
        });
      } catch (err) {
        // Raw exception text never reaches the red alert box (P1-8).
        console.error("[checkout] cash order exception:", err);
        const msg = "We couldn't place your order. Please try again.";
        setValidationError(msg);
        toast.error("Could not place order", { description: msg });
      } finally {
        releaseGuard(submittedScope);
      }
      return;
    }

    // 3. Online Razorpay Flow. A zero-due bill uses the existing server cash
    // creator: it validates the coupon and writes a real zero-due order. It
    // must NOT mint an unpaid online draft or claim payment success.
    if (recoveringZeroDue || finalPayable <= 0) {
      try {
        const zeroRouteScope = captureCompletionScope();
        const zeroDue = await orderRepository.createCashOrder({ zeroDueOnly: true });
        if (!ownsGuard(submittedScope)) return;
        if (!zeroDue.success) {
          const message =
            zeroDue.error.code === "PRICE_CHANGED"
              ? "This order is no longer free. Review your updated bill before placing it."
              : orderFailureMessage(zeroDue.error);
          setValidationError(message);
          toast.error("Could not place order", { description: message });
          return;
        }
        if (zeroDue.data.cashDuePaise !== 0) {
          setValidationError(
            "The final total changed. Please review your bill before placing the order.",
          );
          return;
        }
        const zeroScope = cashSubmissionScope() ?? zeroRouteScope;
        if (!zeroScope || !isCompletionScopeValid(zeroScope)) {
          const message = `Order ${zeroDue.data.id} was placed. Check your orders before paying again.`;
          setTerminalOrderId(zeroDue.data.id);
          setValidationError(message);
          toast.error("Order already placed", { description: message });
          return;
        }
        // A recovered older receipt is shown, but never cleans a newer cart.
        if (!recoveringZeroDue) {
          toast.success("No payment due", {
            description: "Your discount covered the full bill.",
          });
          AudioService.playSuccess();
          void HapticService.notification("success");
          void cartRepository.clear();
          useCheckoutStore.getState().clearNotesAfterCompletedOrder(notesDraftMark);
        }
        void navigate({
          to: "/orders/$orderId/track",
          params: { orderId: zeroDue.data.id },
          replace: true,
        });
      } catch (err) {
        console.error("[checkout] zero-due order exception:", err);
        const msg = "We couldn't place your order. Please try again.";
        setValidationError(msg);
        toast.error("Could not place order", { description: msg });
      } finally {
        releaseGuard(submittedScope);
      }
      return;
    }
    // R5-B2: the online path used to trust the render-time state after the
    // validateCart await. Recheck the submitted identity before any online
    // effect: a changed basket/draft/session cannot mint a gateway order.
    if (!ownsGuard(submittedScope)) return;
    if (!isCompletionScopeValid(submittedScope)) {
      releaseGuard(submittedScope);
      const message =
        "Your checkout changed while placing the order. Review your basket before trying again.";
      setValidationError(message);
      toast.error("Checkout changed", { description: message });
      return;
    }
    try {
      setPaymentStatus("preparing");
      setPaymentFailure(null);
      const quoteForPayment = useCheckoutStore.getState().checkoutFees;
      const orderRes = await paymentRepository.createPaymentOrder({
        loyaltyPointsToRedeem: 0,
        // R8/R6: the server binds the charge to this courier quote.
        deliveryQuoteId:
          isDelivery && quoteForPayment.status === "ready"
            ? (quoteForPayment.deliveryQuoteId ?? undefined)
            : undefined,
      });
      // R5-B2: rebind the reply to the live submission before publishing any
      // outcome. A stale refusal must not re-quote/re-enter; a stale success
      // must not publish a payment order or open a gateway for a newer basket.
      if (!ownsGuard(submittedScope)) return;
      if (!isCompletionScopeValid(submittedScope)) {
        releaseGuard(submittedScope);
        setPaymentStatus("idle");
        return;
      }
      if (!orderRes.success) {
        // A stale/missing quote is recoverable: re-quote, then show the updated
        // price through the existing dialog before retrying. No gateway has
        // opened, so nothing can have been charged.
        if (isDelivery && isDeliveryQuoteRefusal(orderRes.error.code)) {
          releaseGuard(submittedScope);
          setPaymentStatus("idle");
          setPaymentFailure(null);
          await recoverFromQuoteRefusal(submittedScope);
          return;
        }
        releaseGuard(submittedScope);
        setPaymentStatus("failed");
        const message = orderFailureMessage(orderRes.error);
        setPaymentFailure({
          code: orderRes.error.code,
          message,
          // A reconciliation block and a store that is not taking online
          // orders are not retryable: retrying starts a second payment for
          // money the server already has, or cannot ever succeed.
          retryable: !isNonRetryableOrderFailure(orderRes.error.code),
        });
        setValidationError(message);
        if (orderRes.error.code === STORE_NOT_LINKED) setOrderingUnavailable(true);
        toast.error("Couldn't initiate online payment", { description: message });
        return;
      }

      // Server total wins, but never silently: the sheet would otherwise open
      // on a different number than the one the customer just reviewed. No rate
      // is invented here and no fee is sent - we only surface the authoritative
      // total and require acceptance when it changed.
      const displayedTotal = finalPayable;
      const authoritativeTotal =
        typeof orderRes.data.amount === "number" ? orderRes.data.amount : undefined;
      if (
        needsRepriceAcceptance(displayedTotal, authoritativeTotal, acceptedServerAmount.current)
      ) {
        releaseGuard(submittedScope);
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
      // R5-B3: initialize() is itself an await. Recheck the bound submission
      // before the modal can open; a superseded checkout gets no gateway order.
      if (!ownsGuard(submittedScope)) return;
      if (!isCompletionScopeValid(submittedScope)) {
        releaseGuard(submittedScope);
        setPaymentStatus("idle");
        return;
      }
      await razorpayAdapter.openCheckout(
        {
          onSuccess: async (result: PaymentResult) => {
            try {
              const verify = await paymentRepository.verifyPayment(result);
              // R5-B3: money may have moved. Outcomes, finalization and
              // reconciliation are account-bound only: a same-account cart/note
              // edit still finalizes exactly once. A changed uid/epoch writes
              // and publishes nothing. The server's verification is untouched.
              if (!ownsGuard(submittedScope)) return;
              if (!isSameAccountIdentity(submittedScope)) {
                releaseGuard(submittedScope);
                return;
              }
              if (verify.success && verify.data.verified) {
                // proceed to order finalization below
              } else if (!verify.success && verify.error.code === "TRANSFER_IN_PROGRESS") {
                releaseGuard(submittedScope);
                const reconUid = submittedScope.uid;
                usePaymentStore
                  .getState()
                  .setReconciliation(
                    true,
                    "TRANSFER_IN_PROGRESS",
                    usePaymentStore.getState().internalOrderId ?? result.internalOrderId ?? null,
                    usePaymentStore.getState().gatewayOrderId ?? result.orderId ?? null,
                  );
                persistPaymentReconciliation(reconUid, {
                  internalOrderId:
                    usePaymentStore.getState().internalOrderId ?? result.internalOrderId ?? null,
                  gatewayOrderId:
                    usePaymentStore.getState().gatewayOrderId ?? result.orderId ?? null,
                  reason: "TRANSFER_IN_PROGRESS",
                });
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
                releaseGuard(submittedScope);
                const reconUid = submittedScope.uid;
                usePaymentStore
                  .getState()
                  .setReconciliation(
                    true,
                    "ORDER_TERMINAL",
                    usePaymentStore.getState().internalOrderId ?? result.internalOrderId ?? null,
                    usePaymentStore.getState().gatewayOrderId ?? result.orderId ?? null,
                  );
                persistPaymentReconciliation(reconUid, {
                  internalOrderId:
                    usePaymentStore.getState().internalOrderId ?? result.internalOrderId ?? null,
                  gatewayOrderId:
                    usePaymentStore.getState().gatewayOrderId ?? result.orderId ?? null,
                  reason: "ORDER_TERMINAL",
                });
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
                releaseGuard(submittedScope);
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
                  void orderRepository
                    .markPaymentFailed(outcome.internalOrderId)
                    .catch(() => undefined);
                  return;
                }
                // "verified" was handled by the branch above; anything else is
                // a reconciliation outcome. Keep the fallthrough fail-closed.
                if (outcome.kind !== "reconciliation") return;
                // Unknown / possibly-captured outcome: persist reconciliation
                // (which disables the pay button) and surface the recovery
                // panel — never a failed state that invites a re-pay (A08 B9).
                const reconUid = submittedScope.uid;
                usePaymentStore
                  .getState()
                  .setReconciliation(
                    true,
                    outcome.reason,
                    outcome.internalOrderId,
                    outcome.gatewayOrderId,
                  );
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

              releaseGuard(submittedScope);
              // R5-B3/R5-B4: a superseded attempt owns neither publication nor
              // the guard; account identity gates money-time writes and full
              // scope gates local cleanup/navigation/reconciliation clearing.
              if (!ownsGuard(submittedScope) || !isSameAccountIdentity(submittedScope)) return;
              // Paid-but-no-order is NOT success: money moved, no order record.
              // Never clear the cart or navigate to tracking here — surface the
              // failure with the gateway payment id for support recovery.
              if (!created.success) {
                const reconUid = submittedScope.uid;
                usePaymentStore
                  .getState()
                  .setReconciliation(
                    true,
                    "PAYMENT_SYNC_PENDING",
                    verify.data.confirmedOrderId ?? null,
                    result.orderId ?? null,
                  );
                persistPaymentReconciliation(reconUid, {
                  internalOrderId: verify.data.confirmedOrderId ?? null,
                  gatewayOrderId: result.orderId ?? null,
                  reason: "PAYMENT_SYNC_PENDING",
                });
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
              if (!isCompletionScopeValid(submittedScope)) {
                // Same account, newer basket/note: the money is finalized, so
                // surface a visible non-retryable receipt with BOTH ids and
                // keep PAY blocked. Never clear the newer cart/notes nor
                // reconciliation, and never navigate to the superseded order.
                const message = `Order ${created.data.id} was placed; payment ${result.paymentId}. Check your orders before paying again.`;
                setTerminalOrderId(created.data.id);
                setPaymentStatus("waiting");
                setPaymentFailure({
                  code: "PAYMENT_SYNC_PENDING",
                  message,
                  retryable: false,
                  paymentId: result.paymentId,
                });
                setValidationError(message);
                toast.info("Payment received — order placed", { description: message });
                usePaymentStore
                  .getState()
                  .setReconciliation(
                    true,
                    "PAYMENT_SYNC_PENDING",
                    created.data.id,
                    result.orderId ?? null,
                  );
                persistPaymentReconciliation(submittedScope.uid, {
                  internalOrderId: created.data.id,
                  gatewayOrderId: result.orderId ?? null,
                  reason: "PAYMENT_SYNC_PENDING",
                });
                return;
              }
              setPaymentStatus("success");
              AudioService.playSuccess();
              void HapticService.notification("success");
              // D31–D33: balances/ledger stay server-owned; nothing to refresh
              // here because the app no longer presents a wallet.
              const reconUid = submittedScope.uid;
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
              if (!ownsGuard(submittedScope)) return;
              releaseGuard(submittedScope);
              // R5-B3: guard BEFORE any reconciliation write or UI effect.
              // Money may have moved, so a same-account basket/note edit still
              // reconciles; a changed account/lifetime writes nothing.
              if (!isSameAccountIdentity(submittedScope)) return;
              // Post-gateway unknown exception (verify/finalize threw after
              // money may have moved): persist reconciliation and surface the
              // recovery panel — never a failed state that invites a re-pay,
              // never a cart clear or confirmation navigation (A08 B9).
              console.error("[checkout] post-payment exception:", err);
              const reconUid = submittedScope.uid;
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
            if (!ownsGuard(submittedScope)) return;
            releaseGuard(submittedScope);
            // Pre-money callback bound to THIS submission: a stale attempt may
            // only release its own spinner, never publish into newer state.
            if (!isCompletionScopeValid(submittedScope)) return;
            setPaymentStatus("failed");
            // P1-8: gateway description text is not customer copy — log raw.
            console.error("[checkout] gateway onFailure:", err);
            toast.error("Payment not completed", {
              description: "Please try again or choose another payment method.",
            });
          },
          onCancel: () => {
            if (!ownsGuard(submittedScope)) return;
            releaseGuard(submittedScope);
            if (!isCompletionScopeValid(submittedScope)) return;
            setPaymentStatus("cancelled");
            toast.info("Payment cancelled. You can retry when ready.");
          },
        },
        paymentMethod,
      );
    } catch (payErr) {
      if (!ownsGuard(submittedScope)) return;
      releaseGuard(submittedScope);
      // Pre-money initiation failure: release busy/in-flight safely, but a
      // superseded submission publishes no status/copy into the newer state.
      if (!isCompletionScopeValid(submittedScope)) return;
      setPaymentStatus("failed");
      // P1-8: raw gateway/exception text never reaches the red alert box —
      // customers get an honest recovery path instead.
      console.error("[checkout] payment initiation failed:", payErr);
      setValidationError(
        "Payment couldn't be completed. Please try again — if your amount was debited, contact support before retrying.",
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
              <p className="text-sm font-medium text-text-secondary">
                {/* The sticky bar must never imply a final amount while the bill
                    is still provisional: the two readings disagreed live
                    ("To Pay ₹109" beside "Total so far … excludes packaging"). */}
                {quoteView.packagingPending ? "Total so far" : "To Pay"}
              </p>
              <p className="type-price whitespace-nowrap text-xl text-text-primary">
                {totals && quoteView.showTotal
                  ? formatINR(acceptedServerTotal ?? finalPayable)
                  : "—"}
              </p>
              {quoteView.packagingPending && (
                <p className="type-caption text-text-secondary">Excludes packaging</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void handlePlaceOrder()}
              disabled={
                terminalOrderId !== null ||
                busy ||
                !isOnline ||
                totals === null ||
                totalsFailed ||
                !kitchen.isOpen ||
                reconciliationPending ||
                legacyNotesPending ||
                onlineOrderingUnavailable ||
                !fulfillmentSupported ||
                (isAuthenticated && !quoteView.payEnabled)
              }
              aria-disabled={
                terminalOrderId !== null ||
                busy ||
                !isOnline ||
                totals === null ||
                totalsFailed ||
                !kitchen.isOpen ||
                reconciliationPending ||
                legacyNotesPending ||
                onlineOrderingUnavailable ||
                !fulfillmentSupported ||
                (isAuthenticated && !quoteView.payEnabled)
              }
              title={
                terminalOrderId !== null
                  ? `Order ${terminalOrderId} placed — do not pay again`
                  : !fulfillmentSupported
                    ? !fulfillment
                      ? "Choose a fulfillment method"
                      : fulfillmentBlockMessage
                    : onlineOrderingUnavailable
                      ? "This outlet isn't taking online orders yet."
                      : !isAuthenticated
                        ? "Sign in to continue"
                        : !quoteView.payEnabled
                          ? (quoteView.message ?? "Getting delivery price")
                          : reconciliationPending
                            ? "We are confirming your payment — please do not pay again"
                            : legacyNotesPending
                              ? "Review your saved cooking note in the cart first"
                              : !kitchen.isOpen
                                ? kitchenClosedMessage(kitchen)
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
                {!fulfillmentSupported
                  ? "Choose fulfillment"
                  : onlineOrderingUnavailable
                    ? "Online ordering unavailable"
                    : !isAuthenticated
                      ? "Sign in to continue"
                      : !quoteView.payEnabled
                        ? quoteView.storeNotLinked
                          ? "Online ordering unavailable"
                          : quoteView.status === "idle" || quoteView.status === "loading"
                            ? isDelivery
                              ? "Pay — getting delivery price"
                              : "Pay — getting order price"
                            : isDelivery
                              ? "Pay — delivery unavailable"
                              : "Pay — price unavailable"
                        : reconciliationPending
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
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-large)] border border-warning/30 bg-warning/10 px-4 py-3 text-warning-text">
            <div className="flex min-w-0 flex-1 items-start gap-2 type-caption">
              <Timer className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {remainingLockSeconds === 0
                  ? "Price lock expired — rechecked at checkout"
                  : "Checkout price locked"}
              </span>
            </div>
            <span className="type-price shrink-0 text-sm">
              {formatCountdown(remainingLockSeconds)}
            </span>
          </div>
        )}

        {validationError && (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-[var(--radius-large)] border border-error/30 bg-error/10 p-4 type-body-medium text-error"
          >
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
          <div
            role="alert"
            aria-live="assertive"
            className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-large)] border border-error/30 bg-error/10 p-4 type-body-medium text-error"
          >
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

        {/* R8: delivery/order price state. PAY is disabled while the server is
            still quoting, when the address is unserviceable, or on an outage —
            with an honest retry and, for delivery, takeaway as the escape.

            CLS: this banner used to MOUNT when a quote was pending and UNMOUNT
            when it became ready. Measured on the deployed bundle it mounted at
            +141px (t~700) and unmounted at -141px (t~1956), the largest single
            contributor to a 0.309/0.439/0.439 session-window CLS. The slot is
            therefore always present (for delivery) and only its CONTENTS swap;
            `min-h` reserves one message line plus the action row so none of the
            four states can change the page height. */}
        {(isDelivery || (quoteView.message && !quoteView.payEnabled)) && (
          <div
            data-quote-status-slot
            role="status"
            aria-live="polite"
            className={cn(
              // 8.75rem ≈ the measured 141px: one wrapped message line plus the
              // action row (p-4 + body line + 44px control + gap). Anything
              // smaller would still let the ready state collapse the space the
              // loading state needed.
              "min-h-[8.75rem] rounded-[var(--radius-large)]",
              quoteView.message &&
                !quoteView.payEnabled &&
                "border border-warning/30 bg-warning/10",
            )}
          >
            {quoteView.message && !quoteView.payEnabled && (
              <div className="flex flex-col items-start gap-3 p-4 type-body-medium text-warning-text">
                <span>{quoteView.message}</span>
                <span className="flex items-center gap-2">
                  {quoteView.canRetry && (
                    <button
                      type="button"
                      onClick={() => void refreshQuote()}
                      className="inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-full bg-warning/20 px-4 type-button-sm transition-colors hover:bg-warning/30"
                    >
                      Retry
                    </button>
                  )}
                  {quoteView.takeawaySelectable && (
                    <button
                      type="button"
                      onClick={() => setFulfillment("takeaway")}
                      className="inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-full bg-warning/20 px-4 type-button-sm transition-colors hover:bg-warning/30"
                    >
                      Switch to Takeaway
                    </button>
                  )}
                </span>
              </div>
            )}
          </div>
        )}

        {/* 1. Fulfillment Mode Details */}
        {!fulfillmentSupported ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-large)] border border-warning/40 bg-warning/10 p-4 type-body-medium text-warning-text"
          >
            <span>{fulfillmentBlockMessage}</span>
            <Link
              to="/stores"
              className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-warning/20 px-4 type-button-sm transition-colors hover:bg-warning/30"
            >
              Choose Outlet
            </Link>
          </div>
        ) : (
          <FulfillmentDetailsCard
            fulfillment={fulfillment}
            store={activeStore}
            selectedAddress={selectedAddress}
            // CLS: the card must not paint "No delivery address selected"
            // before the read has answered. It was rendering that row at t~700
            // and removing it at t~1113 (-41px) inside the poor-CLS window. A
            // failed read is not an empty list either (CUS-18) — the address
            // block below owns that error copy and its retry.
            addressPending={isDelivery && !addressSettled}
            tableNumber={tableNumber}
            onTableNumberChange={(t) => setTableNumber(t)}
          />
        )}

        {/* Address Selection with Geofencing (Delivery Mode Only) — Standard Delivery only */}
        {isDelivery && (
          <div className="space-y-4 rounded-[var(--radius-large)] border border-divider bg-surface p-4 sm:p-5">
            {/* CUS-18: the read's own states. An in-flight or failed read is
                never rendered as "no saved addresses". */}
            {addressLoadState === "loading" && addresses.length === 0 ? (
              // CLS fix: the skeleton must occupy the same height the loaded
              // list will, or resolving it pushes the whole page down. Measured
              // live at 0.18 CLS. Two skeleton rows + the header matches the
              // common two-address case; the container min-height covers a
              // single-address account so neither direction shifts.
              <div role="status" aria-live="polite" className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="type-title-medium text-text-primary">Delivery Address</h4>
                  <span className="type-caption text-text-secondary">{ADDRESS_LOADING_COPY}</span>
                </div>
                <div className="min-h-[11.5rem] space-y-2.5">
                  <Skeleton className="h-20 w-full rounded-[var(--radius-large)]" />
                  <Skeleton className="h-20 w-full rounded-[var(--radius-large)]" />
                </div>
              </div>
            ) : addressLoadState === "error" && addresses.length === 0 ? (
              <div
                role="alert"
                className="space-y-3 rounded-[var(--radius-large)] border border-warning/40 bg-warning/10 p-4"
              >
                <p className="type-body-medium font-semibold text-warning-text">
                  {addressLoad.error ?? ADDRESS_LOAD_FAILED_COPY}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setAddressReload((value) => value + 1)}
                    className="inline-flex min-h-11 items-center rounded-full bg-warning/20 px-4 type-button-sm text-warning-text transition-colors hover:bg-warning/30"
                  >
                    Try again
                  </button>
                  <Link
                    to="/addresses/create"
                    search={{ returnTo: "/checkout" }}
                    className="inline-flex min-h-11 items-center rounded-full border border-divider bg-surface px-4 type-button-sm text-text transition-colors hover:bg-bg-secondary"
                  >
                    Add Delivery Address
                  </Link>
                </div>
              </div>
            ) : (
              <AddressSelector
                addresses={addresses}
                selectedAddress={selectedAddress}
                activeStore={activeStore}
                onSelectAddress={(addr) => selectAddress(addr.id)}
                onSwitchToTakeaway={() => setFulfillment("takeaway")}
              />
            )}
            <div className="pt-2 border-t border-divider">
              <div className="flex flex-wrap items-start gap-2.5 rounded-[var(--radius-medium)] border border-primary/30 bg-primary/5 p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-medium)] bg-primary text-primary-foreground">
                  <Bike className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="type-body font-semibold text-text-primary">Standard Delivery</p>
                  <p className="type-caption text-text-secondary">
                    {activeStore?.etaMinutes != null
                      ? `Delivered hot in ~${activeStore.etaMinutes} mins • No scheduling needed`
                      : "Delivered hot • No scheduling needed"}
                  </p>
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
            <Link
              to="/cart"
              className="-mr-2 inline-flex min-h-11 items-center px-2 type-caption font-semibold text-primary-text hover:underline"
            >
              Edit Cart
            </Link>
          </div>

          <div className="space-y-2 divide-y divide-divider/50">
            {lines.map((line) => (
              <div
                key={line.lineId}
                className="flex items-start justify-between gap-3 pt-3 first:pt-0 select-none"
              >
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <span className="mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[2px] border border-success p-[1px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  </span>
                  <p className="type-body break-words font-medium text-text-primary">
                    <span className="mr-1 font-semibold text-primary-text">{line.quantity}x</span>{" "}
                    {line.name}
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
              <Link
                to="/cart"
                className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-text hover:underline"
              >
                Edit in Cart
              </Link>
            </div>
            {legacyDraftPending ? (
              <div
                role="alert"
                className="space-y-1 rounded-xl border border-warning/40 bg-warning/10 p-3"
              >
                <p className="text-sm font-medium text-text">
                  Your saved note needs review before payment
                </p>
                <p className="text-sm text-text-secondary">
                  It was saved by an older version and is longer than the 240-character limit. It is
                  not attached to this order. Review it in the cart.
                </p>
                <p className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-sm text-text">
                  {legacyOrderNotes}
                </p>
              </div>
            ) : lineNotesPending ? (
              <div
                role="alert"
                className="space-y-1 rounded-xl border border-warning/40 bg-warning/10 p-3"
              >
                <p className="text-sm font-medium text-text">
                  Item notes need review before payment
                </p>
                <p className="text-sm text-text-secondary">
                  Some items still carry a note from an older cart. Move it into the order note or
                  remove it in the cart — it is not attached to this order.
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
            <h2 className="type-title-medium text-text-primary">3. Coupons</h2>
          </div>

          <PromoInput applied={promo} onChanged={() => void recompute()} />

          {/* D31–D33: loyalty balance/redemption UI removed. Server-held
              balances and ledger history are preserved; the client always
              sends zero points. */}
        </section>

        {/* 4. Bill Summary */}
        <section className="space-y-4 rounded-[var(--radius-large)] border border-divider bg-surface p-4 sm:p-5">
          <div className="flex items-center gap-2 border-b border-divider pb-3">
            <h2 className="type-title-medium text-text-primary">4. Bill Breakdown</h2>
          </div>

          <div className="space-y-2.5 type-caption">
            <div className="flex items-start justify-between gap-3 text-text-secondary">
              <span>Item Total</span>
              <span className="type-price shrink-0 whitespace-nowrap text-right text-text-primary">
                {totals ? (
                  formatINR(totals.subtotal)
                ) : (
                  <span className="text-warning-text">unavailable</span>
                )}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3 text-text-secondary">
              <span>Incl. GST (5%)</span>
              <span className="type-price shrink-0 whitespace-nowrap text-right text-text-primary">
                {totals ? (
                  formatINR(totals.taxes)
                ) : (
                  <span className="text-warning-text">unavailable</span>
                )}
              </span>
            </div>
            <div className="flex min-h-[1.75rem] items-start justify-between gap-3 text-text-secondary">
              <span>Restaurant Packaging</span>
              <span className="type-price shrink-0 whitespace-nowrap text-right text-text-primary">
                {!isAuthenticated ? (
                  <span className="type-caption font-medium">Calculated at checkout</span>
                ) : !totals ? (
                  <span className="text-warning-text">unavailable</span>
                ) : quoteView.packagingFee !== null ? (
                  isDineIn && quoteView.packagingFee === 0 ? (
                    <span className="font-semibold text-success">FREE</span>
                  ) : (
                    formatINR(quoteView.packagingFee)
                  )
                ) : quoteView.status === "unserviceable" || quoteView.status === "error" ? (
                  // A terminal answer, never an eternal spinner: quoting failed,
                  // so the customer is told so and offered a retry.
                  <span className="text-warning-text">Unavailable</span>
                ) : (
                  <span className="text-warning-text">Getting price…</span>
                )}
              </span>
            </div>
            {/* Delivery Fee — server courier quote only (R8). No static fare. */}
            {isDelivery && (
              <div className="flex min-h-[1.75rem] items-start justify-between gap-3 text-text-secondary">
                <span>Delivery Fee</span>
                <span className="type-price shrink-0 whitespace-nowrap text-right text-text-primary">
                  {!isAuthenticated ? (
                    <span className="type-caption font-medium">Calculated at checkout</span>
                  ) : !totals ? (
                    <span className="text-warning-text">unavailable</span>
                  ) : quoteView.showDeliveryFee && quoteView.deliveryFee !== null ? (
                    formatINR(quoteView.deliveryFee)
                  ) : (
                    <span className="text-warning-text">
                      {quoteView.status === "unserviceable" || quoteView.status === "error"
                        ? "Unavailable"
                        : "Getting price…"}
                    </span>
                  )}
                </span>
              </div>
            )}

            {/* Delivery Partner Tip — REMOVED (owner decision 2026-11-25 #1):
                hidden at launch, and it is part of no total. */}

            {totals?.promoDiscount ? (
              <div className="flex items-start justify-between gap-3 font-medium text-success">
                <span>Coupon Discount ({promo?.code ?? "PROMO"})</span>
                <span className="type-price shrink-0 whitespace-nowrap text-right">
                  -{formatINR(totals.promoDiscount)}
                </span>
              </div>
            ) : null}

            <div className="flex items-start justify-between gap-3 border-t border-divider pt-3 type-title-medium text-text-primary">
              <span>{quoteView.packagingPending ? "Total so far" : "To Pay"}</span>
              <span className="type-price shrink-0 whitespace-nowrap text-right text-lg text-text-primary">
                {totals && quoteView.showTotal ? formatINR(finalPayable) : "—"}
              </span>
            </div>
            {/* CLS fix: the caveat used to be INSERTED when the quote resolved,
                which pushed everything below it down. It now always occupies
                one reserved line and simply renders empty when not needed, so
                the block height is identical loading and loaded. */}
            <p
              aria-hidden={!quoteView.packagingPending}
              className="min-h-[1.25rem] text-right type-caption text-text-secondary"
            >
              {quoteView.packagingPending
                ? "Excludes packaging, which this outlet prices at checkout."
                : "\u00A0"}
            </p>
          </div>
        </section>

        {/* 5. Payment Method Selector */}
        <section className="rounded-[var(--radius-large)] border border-divider bg-surface p-4 sm:p-5">
          <PaymentMethodSelector
            selectedMethod={paymentMethod}
            onSelectMethod={(method) => {
              cashRetirementBlocked.current = false;
              setPaymentMethod(method);
            }}
            isDelivery={isDelivery}
            isTakeaway={isTakeaway}
            cashDisabledReason={codAvailability.reason}
          />
        </section>

        {/* 6. WhatsApp order updates — OPT-IN, OFF by default (2026-11-25 #3). */}
        <WhatsappOptInCheckbox checked={whatsappOptIn} onChange={setWhatsappOptIn} />
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
          if (repricePrompt.cash) {
            const { scope, ...cash } = repricePrompt.cash;
            setRepricePrompt(null);
            // Continue belongs to the submission that earned this prompt. A
            // cart/note edit or a session advance while it was open must not
            // replay onto newer state.
            if (!scope || !isCompletionScopeValid(scope)) {
              const message =
                "Your checkout changed while the updated total was open. Review your basket before continuing.";
              setValidationError(message);
              toast.error("Checkout changed", { description: message });
              return;
            }
            void handlePlaceOrderRef.current({ ...cash, scope });
            return;
          }
          acceptedServerAmount.current = repricePrompt.authoritative;
          setAcceptedServerTotal(repricePrompt.authoritative);
          setRepricePrompt(null);
          void handlePlaceOrderRef.current();
        }}
      />
    </AppShell>
  );
}

export default CheckoutPage;
