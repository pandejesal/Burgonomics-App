import * as React from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { MapPin, Trash2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/shared/layouts/AppShell";
import { FailureState } from "@/shared/components/feedback/FailureState";
import { Skeleton } from "@/shared/components/feedback/Skeleton";
import { ConfirmDialog } from "@/shared/components/common/ConfirmDialog";
import { useHydrated } from "@/shared/hooks/useHydrated";
import { useKitchenHours } from "@/shared/hooks/useKitchenHours";
import { KitchenClosedBanner } from "@/shared/components/feedback/KitchenClosedBanner";
import { KITCHEN_CLOSED_MESSAGE } from "@/core/constants/operatingHours";
import { formatINR } from "@/core/utils/format";
import { toUserMessage } from "@/core/errors/userMessages";
import { PACKAGING_FEE_BY_FULFILLMENT, asPricingFulfillment } from "@/shared/pricing/pricingEngine";

import {
  cartRepository,
  useCartStore,
  selectItemCount,
  CartItemRow,
  BillBreakdown,
  DeliveryTipSelector,
  PromoInput,
  CookingInstructionsSection,
} from "@/features/cart";
import type { CartTotals } from "@/features/cart/models";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useCheckoutStore } from "@/features/checkout";
import { FulfillmentSheet } from "@/features/stores/components/FulfillmentSheet";
import { useAddressStore, selectSelectedAddress } from "@/features/addresses";
import { useAuthStore, selectIsAuthenticated } from "@/features/auth/state/authStore";
import { RecentOrdersRail } from "@/features/orders/components/RecentOrdersRail";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your Cart — Burgonomics (100% Pure Vegetarian)" },
      {
        name: "description",
        content: "Review your 100% Pure Veg Burgonomics cart and order breakdown.",
      },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const navigate = useNavigate();
  const hydrated = useHydrated();

  const lines = useCartStore((s) => s.lines);
  const syncPending = useCartStore((s) => s.syncPending);
  const promo = useCartStore((s) => s.promo);
  const status = useCartStore((s) => s.status);
  const error = useCartStore((s) => s.error);
  const itemCount = useCartStore(selectItemCount);
  const activeStore = useStoreSelection((s) => s.activeStore);
  const fulfillment = useStoreSelection((s) => s.fulfillment);
  const setFulfillment = useStoreSelection((s) => s.setFulfillment);
  const selectedAddress = useAddressStore(selectSelectedAddress);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const uid = useAuthStore((s) => s.user?.id ?? null);

  const [totals, setTotals] = React.useState<CartTotals | null>(null);
  const [computing, setComputing] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [checkoutBusy, setCheckoutBusy] = React.useState(false);
  const [fulfillmentOpen, setFulfillmentOpen] = React.useState(false);
  // Seeded from the persisted checkout store (the same object the order and
  // payment payloads read). Starting these at 0 on every mount made a
  // cart → checkout → cart round trip drop a tip the gateway still charged,
  // so the two screens quoted different To Pay for one basket.
  const persistedTip = useCheckoutStore((s) => s.tipAmount);
  const [tipAmount, setTipAmount] = React.useState(persistedTip);
  // Kitchen-hours gate — re-checked on a 30s tick and on tab focus, so a cart
  // left open overnight locks itself at 23:00 IST.
  const kitchen = useKitchenHours();

  // Outlet/account lifecycle: a note written for one outlet must not follow
  // the customer to another. The fence keeps a guest draft through sign-in and
  // never clears from a route unmount (which would wipe a fresh draft).
  const activeStoreId = activeStore?.id ?? null;
  React.useEffect(() => {
    useCheckoutStore.getState().bindNotesScope(uid, activeStoreId);
  }, [uid, activeStoreId]);

  const recompute = React.useCallback(async () => {
    setComputing(true);
    const res = await cartRepository.calculateTotals();
    setComputing(false);
    if (res.success) setTotals(res.data);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    void recompute();
  }, [hydrated, lines, fulfillment, promo, recompute]);

  if (!hydrated) return <CartSkeleton />;

  if (status === "error" && error) {
    return (
      <AppShell title="Your cart" backTo="/menu" showTabs showTopBar>
        <FailureState
          title="We couldn't load your cart"
          message={error}
          onRetry={() => void recompute()}
        />
      </AppShell>
    );
  }

  if (lines.length === 0) {
    return (
      <AppShell title="Your cart" backTo="/menu" showTabs showTopBar>
        <div className="mx-auto max-w-[520px] px-4 py-12 space-y-8">
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-primary/20 bg-primary/10 text-4xl shadow-inner">
              📦
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-text">Your burger box is empty</h2>
              <p className="mx-auto max-w-[320px] text-sm text-text-secondary">
                Explore our 100% Pure Veg menu and add handcrafted smash burgers, loaded sides &
                shakes.
              </p>
            </div>
            <div className="pt-2">
              <Link
                to="/menu"
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 py-3 type-button text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover active:scale-[0.98]"
              >
                <span>Explore Menu</span>
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>

          {/* Recent orders are an authenticated, empty-cart-only surface: a
              guest issues zero history reads, and a filled cart never shows a
              reorder rail.

              Keyed by the canonical uid so an account switch (A -> B) while
              this empty cart stays mounted remounts the rail: without it the
              rail's `orders` state still holds A's rows during B's first
              commit (the in-flight guard stops stale responses, not loaded
              state). */}
          <RecentOrdersRail key={uid ?? "guest"} enabled={isAuthenticated} />

          {/* No kitchen-note editor on an empty cart: there is nothing to cook
              yet, so this surface offers past reorders instead. A saved
              checkout draft is left exactly as-is (never cleared here) and the
              editor comes back with the first item, in the filled branch. */}
        </div>
      </AppShell>
    );
  }

  const onQuantity = async (lineId: string, next: number) => {
    await cartRepository.updateQuantity(lineId, next);
  };

  const onRemove = async (lineId: string, name: string) => {
    await cartRepository.removeItem(lineId);
    toast(`Removed ${name}`, { duration: 2000 });
  };

  const onClear = async () => {
    await cartRepository.clear();
    toast.success("Cart cleared");
  };

  const onCheckout = async () => {
    // Ordering is gated outside 11:00–23:00 IST — the banner explains why.
    if (!kitchen.isOpen) {
      toast.error(KITCHEN_CLOSED_MESSAGE);
      return;
    }
    setCheckoutBusy(true);
    const validation = await cartRepository.validateCart();
    if (!validation.success || !validation.data.valid) {
      setCheckoutBusy(false);
      // Curated cart-issue copy passes through; the failure branch is typed
      // raw-capable (CartRepository), so it is logged + mapped.
      if (!validation.success) console.error("[cart] validation failed:", validation.error);
      toast.error(
        validation.success
          ? (validation.data.issues[0]?.message ?? "Some items are no longer available.")
          : toUserMessage(validation.error),
      );
      return;
    }
    const prep = await cartRepository.prepareCheckout();
    setCheckoutBusy(false);
    if (!prep.success) {
      // Curated repo copy (EMPTY_CART) — no raw text on this path.
      toast.error(prep.error.message);
      return;
    }
    void navigate({ to: "/checkout" });
  };

  const subtotal = totals?.subtotal ?? lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const discountAmount = promo?.discount ? Math.abs(promo.discount) : (totals?.promoDiscount ?? 0);
  // Fallback schedule (only when the pricing engine hasn't produced totals):
  // matches the client pricing engine (free delivery over ₹499, ₹40 fee) so
  // the preview never shows a third schedule. The old fallback (free over
  // ₹349, ₹35 fee, integer GST on the PRE-discount subtotal) disagreed with
  // both the engine and the server. Server re-prices authoritatively at
  // checkout — previews are estimates, never the charge.
  const taxableFallback = Math.max(0, subtotal - discountAmount);
  const deliveryFee =
    totals?.deliveryFee ??
    (fulfillment === "delivery" ? (subtotal > 499 ? 0 : subtotal > 0 ? 40 : 0) : 0);
  const packagingFee =
    totals?.packingFee ??
    (fulfillment === "dinein" || lines.length === 0
      ? 0
      : PACKAGING_FEE_BY_FULFILLMENT[asPricingFulfillment(fulfillment)]);
  const gst = totals?.taxes ?? totals?.tax ?? Math.round(taxableFallback * 0.05 * 100) / 100;
  // MT-09 / BillBreakdown contract: menu prices are GST-INCLUSIVE, so `gst` is
  // display-only. The sticky total used to add it on top, showing a Grand Total
  // ₹X higher than the Bill Details "To Pay" right underneath it.
  //
  // D31–D33: loyalty redemption withdrew from the customer app, so the cart
  // contributes zero points discount here and in the payloads.
  const finalToPay = Math.max(
    0,
    subtotal - discountAmount + packagingFee + deliveryFee + tipAmount,
  );
  const freeDeliveryDelta = Math.max(0, 499 - subtotal);

  return (
    <AppShell
      title="Your Cart"
      backTo="/menu"
      showTabs
      showTopBar
      contentClassName="pb-[calc(10rem+var(--bottom-nav-offset,86px)+env(safe-area-inset-bottom,0px))]"
      rightSlot={
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          aria-label="Clear cart"
          className="flex h-11 w-11 items-center justify-center rounded-full text-text-secondary hover:bg-bg-secondary hover:text-error transition-colors cursor-pointer"
        >
          <Trash2 className="h-4.5 w-4.5" />
        </button>
      }
      bottomSlot={
        <div className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-offset,86px)+env(safe-area-inset-bottom,0px))] z-30 border-t border-divider bg-surface p-4">
          <div className="mx-auto flex max-w-[520px] flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-text-secondary">Grand Total</p>
              <p className="type-price whitespace-nowrap text-xl text-text-primary">
                {formatINR(finalToPay)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void onCheckout()}
              disabled={checkoutBusy || lines.length === 0 || !kitchen.isOpen}
              title={!kitchen.isOpen ? KITCHEN_CLOSED_MESSAGE : undefined}
              className="flex min-h-12 min-w-0 flex-1 basis-[12rem] items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 type-button text-primary-foreground transition-colors hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              <span>{!kitchen.isOpen ? "Kitchen Closed" : "Proceed to Checkout"}</span>
              <ArrowRight className="h-4 w-4 stroke-[2.5px]" />
            </button>
          </div>
        </div>
      }
    >
      <div className="mx-auto max-w-[520px] space-y-6 px-5 py-6 sm:px-6">
        {/* Kitchen closed: menu browsing stays open, checkout is gated. */}
        <KitchenClosedBanner />

        {/* Offline pending-sync notice — cart persists locally either way */}
        {syncPending && (
          <div
            role="status"
            className="rounded-[var(--radius-large)] border border-divider bg-bg-secondary p-4 type-caption text-text-secondary"
          >
            Offline changes saved on this device — will sync when back online.
          </div>
        )}
        {/* Fulfillment & Store Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider pb-5">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center text-primary-text">
              <MapPin className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="type-caption font-semibold text-primary-text">
                  {fulfillment === "delivery"
                    ? "Delivery"
                    : fulfillment === "takeaway"
                      ? "Takeaway"
                      : "Dine-In"}
                </span>
              </div>
              <p className="type-body break-words font-medium text-text-primary">
                {fulfillment === "delivery"
                  ? selectedAddress
                    ? `${selectedAddress.customLabel || selectedAddress.label} • ${selectedAddress.line1}`
                    : "Select Delivery Address"
                  : activeStore
                    ? activeStore.name
                    : "Select Branch"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFulfillmentOpen(true)}
            className="-mr-2 inline-flex min-h-11 shrink-0 cursor-pointer items-center px-2 type-caption font-semibold text-primary-text hover:underline"
          >
            Change
          </button>
        </div>

        {/* Free Delivery Threshold Progress (Delivery Mode Only) */}
        {fulfillment === "delivery" && (
          <div className="space-y-3 rounded-[var(--radius-large)] border border-divider bg-surface p-4">
            <div className="flex items-start justify-between gap-3 type-caption">
              <span className="font-medium text-text-secondary">
                {freeDeliveryDelta === 0
                  ? "🎉 You've unlocked FREE Delivery!"
                  : `Add ${formatINR(freeDeliveryDelta)} more for FREE delivery`}
              </span>
              <span className="type-price shrink-0 text-text-primary">
                {Math.min(100, Math.round((subtotal / 499) * 100))}%
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${Math.min(100, (subtotal / 499) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Cart Line Items */}
        <section aria-labelledby="items-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="items-heading" className="type-title-medium text-text-primary">
              Items in Box ({itemCount})
            </h2>
            {computing && <span className="type-caption text-text-secondary">Recalculating…</span>}
          </div>
          <div>
            {lines.map((line) => (
              <CartItemRow
                key={line.lineId}
                line={line}
                onQuantityChange={(q) => void onQuantity(line.lineId, q)}
                onRemove={() => void onRemove(line.lineId, line.name)}
              />
            ))}
          </div>
          <div className="pt-1">
            <Link
              to="/menu"
              className="inline-flex min-h-11 items-center type-caption font-semibold text-primary-text hover:underline"
            >
              + Add more items from menu
            </Link>
          </div>
        </section>

        {/* ONE order-level kitchen note (the same channel order creation reads).
            Per-item editors and the instruction-chip writer are gone. */}
        <CookingInstructionsSection />

        {/* Promo & Coupons */}
        <section aria-labelledby="promo-heading" className="space-y-2">
          <h2 id="promo-heading" className="type-title-medium text-text-primary">
            Apply Coupon
          </h2>
          <PromoInput applied={promo} onChanged={() => void recompute()} />
        </section>

        {/* D31–D33: loyalty redemption/earned-balance UI withdrew from the
            customer app; server-held balances and ledger history are untouched. */}

        {/* Delivery Partner Tip (Delivery Mode Only) */}
        {fulfillment === "delivery" && (
          <DeliveryTipSelector
            selectedTip={tipAmount}
            onSelectTip={(tip) => {
              setTipAmount(tip);
              // Persist so the order record + gateway carry the tip
              // (createFromCurrentContext reads checkout.tipAmount).
              useCheckoutStore.getState().setTipAmount(tip);
            }}
          />
        )}

        {/* Transparent Financial Bill Breakdown */}
        <BillBreakdown
          subtotal={subtotal}
          discountAmount={discountAmount}
          coinsRedeemed={0}
          deliveryFee={deliveryFee}
          packagingFee={packagingFee}
          gstAmount={gst}
          tipAmount={tipAmount}
          fulfillment={fulfillment ?? undefined}
        />
      </div>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear your cart?"
        description="This will remove all items from your cart. This action cannot be undone."
        confirmLabel="Clear cart"
        destructive
        onConfirm={() => void onClear()}
      />

      <FulfillmentSheet
        open={fulfillmentOpen}
        onOpenChange={setFulfillmentOpen}
        store={activeStore}
        value={fulfillment}
        onConfirm={(f) => {
          setFulfillment(f);
          setFulfillmentOpen(false);
        }}
      />
    </AppShell>
  );
}

function CartSkeleton() {
  return (
    <AppShell title="Your cart" backTo="/menu" showTabs showTopBar>
      <div className="mx-auto max-w-[520px] space-y-3 px-4 py-4">
        <Skeleton className="h-12 w-full rounded-2xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    </AppShell>
  );
}

export default CartPage;
