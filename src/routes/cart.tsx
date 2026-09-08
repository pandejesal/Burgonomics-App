import * as React from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { MapPin, ShoppingBag, Trash2, Timer, Sparkles, ArrowRight, Plus, Minus, ShieldCheck, Heart } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { HapticService } from "@/core/services/haptics";

import { AppShell } from "@/shared/layouts/AppShell";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { FailureState } from "@/shared/components/feedback/FailureState";
import { Skeleton } from "@/shared/components/feedback/Skeleton";
import { ConfirmDialog } from "@/shared/components/common/ConfirmDialog";
import { useHydrated } from "@/shared/hooks/useHydrated";
import { formatINR } from "@/core/utils/format";
import { FREE_DELIVERY_THRESHOLD, DELIVERY_FEE_FLAT } from "@/shared/pricing/pricingEngine";

import {
  cartRepository,
  useCartStore,
  selectItemCount,
  CartItemList,
  BillBreakdown,
  GrillCoinsRedemption,
  DeliveryTipSelector,
  OrderSummary,
  PromoInput,
} from "@/features/cart";
import type { CartTotals } from "@/features/cart/models";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useCheckoutStore } from "@/features/checkout";
import { FulfillmentSheet } from "@/features/stores/components/FulfillmentSheet";
import { useAddressStore, selectSelectedAddress } from "@/features/addresses";
import { useLoyaltyStore } from "@/features/loyalty/state/loyaltyStore";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your Cart — Burgonomics (100% Pure Vegetarian)" },
      { name: "description", content: "Review your 100% Pure Veg Burgonomics cart and order breakdown." },
    ],
  }),
  component: CartPage,
});

const INSTRUCTION_PILLS = [
  "Leave with guard",
  "Avoid calling",
  "Don't ring bell",
  "Eco: No plastic cutlery",
  "Less Spicy",
  "Extra Napkins",
];

// Merge one chip toggle into persisted checkout notes. Chips are stored as
// "|" separated parts; free text typed in checkout never contains that
// separator from this writer, and removal only drops exact chip matches,
// so user-typed notes are preserved. Idempotent under StrictMode re-invoke.
function mergeChipIntoNotes(current: string, chip: string, selecting: boolean): string {
  const parts = current
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => p !== chip);
  if (selecting) parts.push(chip);
  return parts.join(" | ");
}

function CartPage() {
  const navigate = useNavigate();
  const hydrated = useHydrated();

  const lines = useCartStore((s) => s.lines);
  const syncPending = useCartStore((s) => s.syncPending);
  const promo = useCartStore((s) => s.promo);
  const status = useCartStore((s) => s.status);
  const error = useCartStore((s) => s.error);
  const itemCount = useCartStore(selectItemCount);
  const priceLockExpiresAt = useCartStore((s) => s.priceLockExpiresAt);
  const activeStore = useStoreSelection((s) => s.activeStore);
  const fulfillment = useStoreSelection((s) => s.fulfillment);
  const setFulfillment = useStoreSelection((s) => s.setFulfillment);
  const selectedAddress = useAddressStore(selectSelectedAddress);
  const loyaltyBalance = useLoyaltyStore((s) => s.balance);

  const [totals, setTotals] = React.useState<CartTotals | null>(null);
  const [computing, setComputing] = React.useState(false);
  const [totalsError, setTotalsError] = React.useState<string | null>(null);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [checkoutBusy, setCheckoutBusy] = React.useState(false);
  const [fulfillmentOpen, setFulfillmentOpen] = React.useState(false);
  // Seed from persisted checkout notes so chips stay in sync when the user
  // navigates back from /checkout (order creation reads checkout.orderNotes).
  const [selectedChips, setSelectedChips] = React.useState<string[]>(() =>
    INSTRUCTION_PILLS.filter((chip) =>
      useCheckoutStore
        .getState()
        .orderNotes.split("|")
        .map((p) => p.trim())
        .includes(chip),
    ),
  );
  const [remainingLockSeconds, setRemainingLockSeconds] = React.useState<number | null>(null);
  // Tip + coins live in persisted checkout state (not local useState) so
  // they survive cart → checkout → payment and reach the order payload.
  const tipAmount = useCheckoutStore((s) => s.tipAmount);
  const setTipAmount = useCheckoutStore((s) => s.setTipAmount);
  const coinsRedeemed = useCheckoutStore((s) => s.loyaltyPointsToRedeem);
  const setCoinsRedeemed = useCheckoutStore((s) => s.setLoyaltyPointsToRedeem);

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
    setComputing(true);
    setTotalsError(null);
    const res = await cartRepository.calculateTotals();
    setComputing(false);
    if (res.success) {
      setTotals(res.data);
    } else {
      // Fail-closed: no invented bill. The footer disables checkout and
      // offers retry; the breakdown renders skeletons, not ₹0s.
      setTotals(null);
      setTotalsError(res.error.message);
    }
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
        <div className="mx-auto max-w-[520px] px-4 py-12 text-center space-y-4">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-[#0E4825]/10 border border-[#0E4825]/20 flex items-center justify-center text-4xl shadow-inner">
            📦
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-black text-text">
              Your burger box is empty!
            </h2>
            <p className="text-xs sm:text-sm text-text-secondary max-w-[320px] mx-auto">
              Explore our 100% Pure Veg menu and add handcrafted smash burgers, loaded sides & shakes.
            </p>
          </div>
          <div className="pt-2">
            <Link
              to="/menu"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#FF6600] hover:bg-[#e05a00] text-white font-bold text-xs sm:text-sm shadow-md transition-all active:scale-95"
            >
              <span>Explore Menu</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
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

  const onNotes = async (lineId: string, notes: string) => {
    await cartRepository.updateNotes(lineId, notes);
  };

  const onClear = async () => {
    await cartRepository.clear();
    toast.success("Cart cleared");
  };

  const toggleChip = (chip: string) => {
    void HapticService.selection();
    const selecting = !selectedChips.includes(chip);
    setSelectedChips((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip],
    );
    // Mirror into checkout orderNotes (the only notes channel order
    // creation reads) while preserving any free text typed in checkout.
    const { orderNotes, setOrderNotes } = useCheckoutStore.getState();
    setOrderNotes(mergeChipIntoNotes(orderNotes, chip, selecting));
  };

  const onCheckout = async () => {
    setCheckoutBusy(true);
    const validation = await cartRepository.validateCart();
    if (!validation.success || !validation.data.valid) {
      setCheckoutBusy(false);
      toast.error(
        validation.success
          ? (validation.data.issues[0]?.message ?? "Some items are no longer available.")
          : validation.error.message,
      );
      return;
    }
    const prep = await cartRepository.prepareCheckout();
    setCheckoutBusy(false);
    if (!prep.success) {
      toast.error(prep.error.message);
      return;
    }
    void navigate({ to: "/checkout" });
  };

  const subtotal = totals?.subtotal ?? lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const discountAmount = promo?.discount ? Math.abs(promo.discount) : (totals?.promoDiscount ?? 0);
  // Preview estimates while the engine hasn't produced totals — same
  // single schedule as pricingEngine (free delivery over the shared
  // threshold, shared flat fee). Never shown as the charge: the footer
  // stays disabled until real totals arrive, and the server reprices.
  const taxableFallback = Math.max(0, subtotal - discountAmount);
  const deliveryFee =
    totals?.deliveryFee ??
    (fulfillment === "delivery"
      ? (subtotal > FREE_DELIVERY_THRESHOLD ? 0 : subtotal > 0 ? DELIVERY_FEE_FLAT : 0)
      : 0);
  const packagingFee = totals?.packingFee ?? (fulfillment === "dinein" || lines.length === 0 ? 0 : 15);
  const gst = totals?.taxes ?? totals?.tax ?? Math.round(taxableFallback * 0.05 * 100) / 100;
  const finalToPay = Math.max(
    0,
    subtotal - discountAmount - coinsRedeemed + gst + packagingFee + deliveryFee + tipAmount
  );
  const freeDeliveryDelta = Math.max(0, FREE_DELIVERY_THRESHOLD - subtotal);
  const totalsReady = totals !== null;

  return (
    <AppShell
      title="Your Cart"
      backTo="/menu"
      showTabs
      showTopBar
      contentClassName="pb-[calc(190px+env(safe-area-inset-bottom,0px))]"
      rightSlot={
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          aria-label="Clear cart"
          className="flex h-10 w-10 items-center justify-center rounded-full text-text-secondary hover:bg-bg-secondary hover:text-red-500 transition-colors cursor-pointer"
        >
          <Trash2 className="h-4.5 w-4.5" />
        </button>
      }
      bottomSlot={
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom,0px))] z-30 border-t border-divider bg-surface/95 backdrop-blur-md p-4 shadow-2xl">
          <div className="mx-auto flex max-w-[520px] items-center justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase font-bold text-text-secondary">Grand Total</p>
              {totalsReady ? (
                <p className="font-mono text-xl font-black text-text">
                  {formatINR(finalToPay)}
                </p>
              ) : (
                <Skeleton className="h-7 w-24 rounded-lg" />
              )}
            </div>
            {totalsError && !totalsReady ? (
              <button
                type="button"
                onClick={() => void recompute()}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#FF6600] hover:bg-[#e05a00] py-3.5 px-6 text-xs sm:text-sm font-extrabold uppercase tracking-wider text-white shadow-lg active:scale-[0.98] transition-all cursor-pointer"
              >
                <span>Retry bill</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void onCheckout()}
                disabled={checkoutBusy || lines.length === 0 || !totalsReady}
                title={!totalsReady ? "Calculating your bill…" : undefined}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#FF6600] hover:bg-[#e05a00] py-3.5 px-6 text-xs sm:text-sm font-extrabold uppercase tracking-wider text-white shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
              >
                <span>{totalsReady ? "Proceed to Checkout" : "Calculating bill…"}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
          {totalsError && !totalsReady && (
            <p role="alert" className="mx-auto max-w-[520px] pt-2 text-[11px] font-semibold text-red-500">
              {totalsError}
            </p>
          )}
        </div>
      }
    >
      <div className="mx-auto max-w-[520px] space-y-4 px-4 py-3">
        {/* Offline pending-sync notice — cart persists locally either way */}
        {syncPending && (
          <div role="status" className="rounded-2xl border border-divider bg-bg-secondary px-3.5 py-2.5 text-xs font-semibold text-text-secondary">
            Offline changes saved on this device — will sync when back online.
          </div>
        )}
        {/* 10-Minute Price Lock Timer Banner */}
        {remainingLockSeconds !== null && (
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-amber-500/10 border border-amber-500/25 px-3.5 py-2.5 text-amber-800 dark:text-amber-300 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Timer className="h-4 w-4 text-amber-600 dark:text-amber-400 animate-pulse" />
              <span>
                {remainingLockSeconds === 0
                  ? "Price lock expired — latest prices apply at checkout"
                  : "Prices locked for this order"}
              </span>
            </div>
            <span className="font-mono text-xs font-black bg-amber-500/20 px-2.5 py-0.5 rounded-md">
              {formatCountdown(remainingLockSeconds)}
            </span>
          </div>
        )}

        {/* Fulfillment & Store Banner */}
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-divider bg-surface p-3.5 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0E4825]/10 text-[#0E4825] dark:text-[#4ADE80]">
              <MapPin className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#0E4825] dark:text-[#4ADE80]">
                  {fulfillment === "delivery" ? "🛵 Delivery" : fulfillment === "takeaway" ? "🛍️ Takeaway" : "🍽️ Dine-In"}
                </span>
              </div>
              <p className="text-xs font-bold text-text truncate">
                {fulfillment === "delivery"
                  ? selectedAddress ? `${selectedAddress.customLabel || selectedAddress.label.toUpperCase()} • ${selectedAddress.line1}` : "Select Delivery Address"
                  : activeStore ? activeStore.name : "Select Branch"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFulfillmentOpen(true)}
            className="text-xs font-bold text-[#FF6600] hover:underline shrink-0 cursor-pointer"
          >
            Change
          </button>
        </div>

        {/* Free Delivery Threshold Progress (Delivery Mode Only) */}
        {fulfillment === "delivery" && (
          <div className="rounded-2xl border border-divider bg-surface p-3.5 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-text-secondary">
                {freeDeliveryDelta === 0
                  ? "🎉 You've unlocked FREE Delivery!"
                  : `Add ${formatINR(freeDeliveryDelta)} more for FREE delivery`}
              </span>
              <span className="font-mono font-bold text-text">{Math.min(100, Math.round((subtotal / FREE_DELIVERY_THRESHOLD) * 100))}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-bg-secondary overflow-hidden">
              <div
                className="h-full bg-[#0E4825] transition-all duration-500 rounded-full"
                style={{ width: `${Math.min(100, (subtotal / FREE_DELIVERY_THRESHOLD) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Cart Line Items */}
        <section aria-labelledby="items-heading" className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 id="items-heading" className="text-xs font-bold uppercase tracking-wider text-text-secondary">
              Items in Box ({itemCount})
            </h2>
            {computing && <span className="text-xs text-text-secondary">Recalculating…</span>}
          </div>
          <div className="space-y-2.5">
            <CartItemList
              lines={lines}
              onQuantityChange={(lineId, q) => void onQuantity(lineId, q)}
              onRemove={(lineId, name) => void onRemove(lineId, name)}
              onNotesChange={(lineId, n) => void onNotes(lineId, n)}
            />
          </div>
          <div className="pt-1">
            <Link to="/menu" className="text-xs font-bold text-[#FF6600] hover:underline">
              + Add more items from menu
            </Link>
          </div>
        </section>

        {/* Cooking & Delivery Instruction Pills */}
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Delivery & Kitchen Instructions
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {INSTRUCTION_PILLS.map((chip) => {
              const selected = selectedChips.includes(chip);
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => toggleChip(chip)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-all cursor-pointer ${
                    selected
                      ? "bg-[#0E4825] text-white border-[#0E4825] shadow-xs font-bold"
                      : "bg-surface text-text-secondary border-divider hover:border-primary/40"
                  }`}
                >
                  {selected ? `✓ ${chip}` : `+ ${chip}`}
                </button>
              );
            })}
          </div>
        </section>

        {/* Promo & Coupons */}
        <section aria-labelledby="promo-heading" className="space-y-2">
          <h2 id="promo-heading" className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Apply Coupon
          </h2>
          <PromoInput applied={promo} onChanged={() => void recompute()} />
        </section>

        {/* Loyalty Points redemption — live balance, 1 pt = Rs.1, max 20% */}
        <GrillCoinsRedemption
          availableCoins={loyaltyBalance}
          subtotal={subtotal}
          redeemedCoins={coinsRedeemed}
          onToggleRedemption={(redeem, coins) => {
            setCoinsRedeemed(redeem ? coins : 0);
          }}
        />

        {/* Delivery Partner Tip (Delivery Mode Only) */}
        {fulfillment === "delivery" && (
          <DeliveryTipSelector
            selectedTip={tipAmount}
            onSelectTip={(tip) => setTipAmount(tip)}
          />
        )}

        {/* Transparent Financial Bill Breakdown */}
        <BillBreakdown
          subtotal={subtotal}
          discountAmount={discountAmount}
          coinsRedeemed={coinsRedeemed}
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
