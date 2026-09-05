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
  Wallet,
  Coins,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { AppShell } from "@/shared/layouts/AppShell";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { Skeleton } from "@/shared/components/feedback/Skeleton";
import { useHydrated } from "@/shared/hooks/useHydrated";
import { formatINR } from "@/core/utils/format";
import { HapticService } from "@/core/services/haptics";
import { AudioService } from "@/core/services/audio";
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
import {
  useCheckoutStore,
  AddressSelector,
  FulfillmentDetailsCard,
  PaymentMethodSelector,
  calculateHaversineKm,
} from "@/features/checkout";
import { useLoyaltyStore } from "@/features/loyalty/state/loyaltyStore";
import { useAddressStore, selectAddresses, selectSelectedAddress } from "@/features/addresses";
import {
  usePaymentStore,
  paymentRepository,
  razorpayAdapter,
} from "@/features/payments";
import type { PaymentMethod, PaymentResult } from "@/features/payments/models";
import { orderRepository, type PaymentDisplayStatus } from "@/features/orders";
import { QuickAuthSheet } from "@/features/checkout/components/QuickAuthSheet";

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
  const setOrderNotes = useCheckoutStore((s) => s.setOrderNotes);
  const tableNumber = useCheckoutStore((s) => s.tableNumber ?? "");
  const setTableNumber = useCheckoutStore((s) => s.setTableNumber ?? (() => {}));
  
  const addresses = useAddressStore(selectAddresses);
  const selectedAddress = useAddressStore(selectSelectedAddress);
  const selectAddress = useAddressStore((s) => s.select);

  const paymentMethod = usePaymentStore((s) => s.method);
  const setPaymentMethod = usePaymentStore((s) => s.setMethod);
  const setPaymentStatus = usePaymentStore((s) => s.setStatus);
  const setPaymentFailure = usePaymentStore((s) => s.setFailure);
  const setPaymentOrder = usePaymentStore((s) => s.setOrder);
  const setPaymentVerification = usePaymentStore((s) => s.setVerification);

  const [totals, setTotals] = React.useState<CartTotals | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [authSheetOpen, setAuthSheetOpen] = React.useState(false);
  const [redeemPoints, setRedeemPoints] = React.useState(false);
  const [remainingLockSeconds, setRemainingLockSeconds] = React.useState<number | null>(null);

  const loyaltyBalance = useLoyaltyStore((s) => s.balance);
  // 1 point = Rs.1, capped at 20% of subtotal — matches the server cap, so the
  // displayed price is the price the gateway actually charges.
  const maxPointsDiscount = Math.min(loyaltyBalance, Math.floor((totals?.subtotal ?? 0) * 0.2));
  const pointsDiscount = redeemPoints ? maxPointsDiscount : 0;

  // 10-Minute Price Lock Countdown Timer
  React.useEffect(() => {
    if (!priceLockExpiresAt) {
      setRemainingLockSeconds(600);
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
    if (res.success) setTotals(res.data);
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
  const finalPayable = Math.max(0, rawGrandTotal - pointsDiscount);

  const handlePlaceOrder = async () => {
    setValidationError(null);

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

    // Geofence check if Delivery mode
    if (isDelivery && selectedAddress && activeStore) {
      const userLat = selectedAddress.lat ?? activeStore.lat + 0.015;
      const userLng = selectedAddress.lng ?? activeStore.lng + 0.015;
      const dist = calculateHaversineKm(userLat, userLng, activeStore.lat, activeStore.lng);
      if (dist > (activeStore.deliveryRadiusKm ?? 8.0)) {
        setValidationError(
          `This address is ${dist} km away, which exceeds our ${activeStore.deliveryRadiusKm ?? 8.0} km delivery zone. Please switch to Takeaway.`
        );
        toast.error("Address is outside delivery range.");
        return;
      }
    }

    setBusy(true);

    // 1. Cart preflight validation
    const validation = await cartRepository.validateCart();
    if (!validation.success || !validation.data.valid) {
      setBusy(false);
      const msg = validation.success
        ? (validation.data.issues[0]?.message ?? "Some items in your cart are no longer available.")
        : validation.error.message;
      setValidationError(msg);
      toast.error(msg);
      return;
    }

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
        if (!created.success) {
          setValidationError(created.error.message);
          toast.error("Could not place order", { description: created.error.message });
          return;
        }

        AudioService.playSuccess();
        void HapticService.notification("success");
        if (redeemPoints && pointsDiscount > 0) {
          useLoyaltyStore.getState().redeem(pointsDiscount);
        }
        void cartRepository.clear();
        void navigate({
          to: "/orders/$orderId/track",
          params: { orderId: created.data.id },
          replace: true,
        });
      } catch (err) {
        setBusy(false);
        const msg = err instanceof Error ? err.message : "Error placing cash order.";
        setValidationError(msg);
        toast.error("Could not place order", { description: msg });
      }
      return;
    }

    // 3. Online Razorpay Flow
    try {
      setPaymentStatus("preparing");
      const orderRes = await paymentRepository.createPaymentOrder({
        loyaltyPointsToRedeem: redeemPoints ? pointsDiscount : 0,
      });
      if (!orderRes.success) {
        setBusy(false);
        setPaymentStatus("failed");
        setPaymentFailure({
          code: orderRes.error.code,
          message: orderRes.error.message,
          retryable: true,
        });
        setValidationError(orderRes.error.message);
        toast.error("Couldn't initiate online payment", { description: orderRes.error.message });
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
              if (!verify.success || !verify.data.verified) {
                setBusy(false);
                setPaymentStatus("failed");
                toast.error("Payment verification failed", {
                  description: verify.success ? "Signature mismatch" : verify.error.message,
                });
                return;
              }
              setPaymentVerification(verify.data);

              const created = await orderRepository.createFromCurrentContext({
                confirmedOrderId: verify.data.confirmedOrderId,
                paymentMethod: result.method,
                transactionId: result.paymentId,
              });

              setBusy(false);
              setPaymentStatus("success");
              AudioService.playSuccess();
              void HapticService.notification("success");
              if (redeemPoints && pointsDiscount > 0) {
                useLoyaltyStore.getState().redeem(pointsDiscount);
              }
              void cartRepository.clear();
              const orderId = created.success ? created.data.id : verify.data.confirmedOrderId;
              void navigate({
                to: "/orders/$orderId/track",
                params: { orderId },
                replace: true,
              });
            } catch {
              setBusy(false);
              setPaymentStatus("failed");
              toast.error("Verification error occurred.");
            }
          },
          onFailure: (err) => {
            setBusy(false);
            setPaymentStatus("failed");
            toast.error("Payment not completed", { description: err.description });
          },
          onCancel: () => {
            setBusy(false);
            setPaymentStatus("cancelled");
            toast.info("Payment cancelled. You can retry when ready.");
          },
        },
        paymentMethod,
      );
    } catch (payErr) {
      setBusy(false);
      setPaymentStatus("failed");
      const msg = payErr instanceof Error ? payErr.message : "Payment gateway error.";
      setValidationError(msg);
    }
  };

  return (
    <AppShell
      title="Checkout"
      backTo="/cart"
      showTabs={false}
      showTopBar
      bottomSlot={
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-divider bg-surface/95 backdrop-blur-md p-4 shadow-2xl">
          <div className="mx-auto flex max-w-[520px] items-center justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase font-bold text-text-secondary">To Pay</p>
              <p className="font-mono text-xl font-black text-text">
                {formatINR(finalPayable)}
              </p>
            </div>
            <button
              type="button"
              onClick={handlePlaceOrder}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#FF6600] hover:bg-[#e05a00] py-3.5 px-6 text-xs sm:text-sm font-extrabold uppercase tracking-wider text-white shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
            >
              <Lock className="h-4 w-4 stroke-[2.5px]" />
              <span>{busy ? "Processing Order..." : `PAY ${formatINR(finalPayable)} SECURELY`}</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="mx-auto max-w-[520px] space-y-4 px-4 py-3 pb-28">
        {/* Price Lock Banner */}
        {remainingLockSeconds !== null && (
          <div className="flex items-center justify-between rounded-2xl bg-amber-500/10 border border-amber-500/25 px-3.5 py-2 text-amber-800 dark:text-amber-300 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Timer className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span>Checkout Price Locked</span>
            </div>
            <span className="font-mono text-xs font-black">{formatCountdown(remainingLockSeconds)}</span>
          </div>
        )}

        {validationError && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs font-bold text-red-500 shadow-xs">
            {validationError}
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
          <div className="rounded-2xl border border-divider bg-surface p-4 shadow-xs space-y-3">
            <AddressSelector
              addresses={addresses}
              selectedAddress={selectedAddress}
              activeStore={activeStore}
              onSelectAddress={(addr) => selectAddress(addr.id)}
              onSwitchToTakeaway={() => setFulfillment("takeaway")}
            />

            <div className="pt-2 border-t border-divider">
              <div className="flex items-center gap-2.5 rounded-xl border border-[#0E4825]/30 bg-[#0E4825]/5 p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0E4825] text-white">
                  <Bike className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-text">Standard Delivery</p>
                  <p className="text-[11px] text-text-secondary">Delivered hot in 25-35 mins • No scheduling needed</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#0E4825] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white">
                  ASAP
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 2. Order Review & Cooking Notes */}
        <section className="rounded-2xl border border-divider bg-surface p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-divider pb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#0E4825]/10 text-[#0E4825] dark:text-[#4ADE80] flex items-center justify-center">
                <ShoppingBag className="h-4 w-4" />
              </div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-text">
                2. Order Review ({itemCount} {itemCount === 1 ? "Item" : "Items"})
              </h2>
            </div>
            <Link to="/cart" className="text-xs font-bold text-[#FF6600] hover:underline">
              Edit Cart
            </Link>
          </div>

          <div className="space-y-2 divide-y divide-divider/50">
            {lines.map((line) => (
              <div key={line.lineId} className="flex items-center justify-between pt-2 first:pt-0 select-none">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[2px] border border-emerald-600 p-[1px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  </span>
                  <p className="text-xs font-bold text-text truncate">
                    <span className="text-[#FF6600] mr-1">{line.quantity}x</span> {line.name}
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-text shrink-0">
                  {formatINR(line.unitPrice * line.quantity)}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-2">
            <label className="block text-[11px] font-bold text-text-secondary mb-1">
              Cooking / Delivery Instructions
            </label>
            <input
              type="text"
              placeholder="e.g. Leave package at door, extra napkins, less spicy..."
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-divider bg-bg-secondary px-3.5 py-2 text-xs text-text outline-none focus:border-primary transition-colors"
            />
          </div>
        </section>

        {/* 3. Coupons & Loyalty Rewards */}
        <section className="rounded-2xl border border-divider bg-surface p-4 shadow-xs space-y-3">
          <div className="flex items-center gap-2 border-b border-divider pb-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Sparkles className="h-4 w-4" />
            </div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-text">
              3. Coupons & Loyalty Points
            </h2>
          </div>

          <PromoInput applied={promo} onChanged={() => void recompute()} />

          {/* Loyalty Points redemption toggle — 1 pt = Rs.1, max 20% of subtotal */}
          <div className="flex items-center justify-between rounded-2xl bg-amber-500/10 border border-amber-500/20 p-3.5 select-none">
            <div className="flex items-center gap-2.5">
              <Coins className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <p className="text-xs font-bold text-text">
                  Redeem Loyalty Points
                </p>
                <p className="text-[11px] text-text-secondary">
                  Balance: {loyaltyBalance} pts ({formatINR(maxPointsDiscount)} max off)
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={maxPointsDiscount <= 0}
              onClick={() => {
                void HapticService.selection();
                setRedeemPoints(!redeemPoints);
              }}
              className={`rounded-full px-3.5 py-1.5 min-h-[36px] text-xs font-bold transition-all cursor-pointer disabled:opacity-40 ${
                redeemPoints
                  ? "bg-[#0E4825] text-white shadow-xs"
                  : "bg-surface border border-divider text-text hover:border-primary"
              }`}
            >
              {redeemPoints ? "Applied" : "Redeem"}
            </button>
          </div>
        </section>

        {/* 4. Bill Summary */}
        <section className="rounded-2xl border border-divider bg-surface p-4 shadow-xs space-y-2.5">
          <div className="flex items-center gap-2 border-b border-divider pb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-text">
              4. Bill Breakdown
            </h2>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-text-secondary">
              <span>Item Total</span>
              <span className="font-mono font-bold text-text">{formatINR(totals?.subtotal ?? 0)}</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>Govt. GST (5%)</span>
              <span className="font-mono font-bold text-text">{formatINR(totals?.taxes ?? 0)}</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>Restaurant Packaging</span>
              <span className="font-mono font-bold text-text">
                {isDineIn ? <span className="text-[#4ADE80] font-black uppercase">FREE</span> : formatINR(totals?.packingFee ?? 15)}
              </span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>Delivery Fee</span>
              <span className="font-mono font-bold text-text">
                {totals?.deliveryFee === 0 || !isDelivery ? (
                  <span className="font-bold text-[#4ADE80] uppercase text-[10px]">FREE</span>
                ) : (
                  formatINR(totals?.deliveryFee ?? 35)
                )}
              </span>
            </div>

            {totals?.promoDiscount ? (
              <div className="flex justify-between text-[#4ADE80] font-semibold">
                <span>Coupon Discount ({promo?.code ?? "PROMO"})</span>
                <span className="font-mono font-bold">-{formatINR(totals.promoDiscount)}</span>
              </div>
            ) : null}

            {redeemPoints && pointsDiscount > 0 && (
              <div className="flex justify-between text-[#4ADE80] font-semibold">
                <span>Loyalty Points Redeemed</span>
                <span className="font-mono font-bold">-{formatINR(pointsDiscount)}</span>
              </div>
            )}

            <div className="border-t border-divider pt-2.5 flex justify-between text-sm sm:text-base font-black text-text">
              <span>Grand Total</span>
              <span className="font-mono text-[#FF6600] font-black text-lg">{formatINR(finalPayable)}</span>
            </div>
          </div>
        </section>

        {/* 5. Payment Method Selector */}
        <section className="rounded-2xl border border-divider bg-surface p-4 shadow-xs">
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
          setTimeout(() => {
            void handlePlaceOrder();
          }, 300);
        }}
      />
    </AppShell>
  );
}

export default CheckoutPage;
