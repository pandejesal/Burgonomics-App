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
  ShieldCheck,
  CreditCard,
  Coins,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { AppShell } from "@/shared/layouts/AppShell";
import { AppButton } from "@/shared/components/common/AppButton";
import { AppBadge } from "@/shared/components/common/AppBadge";
import { Text } from "@/shared/components/common/Text";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { Skeleton } from "@/shared/components/feedback/Skeleton";
import { useHydrated } from "@/shared/hooks/useHydrated";
import { formatINR } from "@/core/utils/format";
import { HapticService } from "@/core/services/haptics";
import { AudioService } from "@/core/services/audio";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import {
  cartRepository,
  useCartStore,
  selectItemCount,
  OrderSummary,
  PromoInput,
} from "@/features/cart";
import type { CartTotals } from "@/features/cart/models";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useAuthStore, selectIsAuthenticated } from "@/features/auth/state/authStore";
import {
  CheckoutSection,
  ReviewItemsList,
  NotesEditor,
  checkoutRepository,
  useCheckoutStore,
} from "@/features/checkout";
import { useAddressStore, selectSelectedAddress, AddressCard } from "@/features/addresses";
import {
  PaymentMethodList,
  SecurePaymentBadge,
  usePaymentStore,
  paymentRepository,
  razorpayAdapter,
} from "@/features/payments";
import type { PaymentMethod, PaymentResult } from "@/features/payments/models";
import { orderRepository, type PaymentDisplayStatus } from "@/features/orders";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — Burgonomics" },
      { name: "description", content: "Complete your Burgonomics order securely." },
    ],
  }),
  component: CheckoutPage,
});

type Step = 1 | 2 | 3;

function CheckoutPage() {
  const navigate = useNavigate();
  const hydrated = useHydrated();

  const lines = useCartStore((s) => s.lines);
  const promo = useCartStore((s) => s.promo);
  const itemCount = useCartStore(selectItemCount);

  const activeStore = useStoreSelection((s) => s.activeStore);
  const fulfillment = useStoreSelection((s) => s.fulfillment);
  const setFulfillment = useStoreSelection((s) => s.setFulfillment);

  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const authStatus = useAuthStore((s) => s.status);

  const orderNotes = useCheckoutStore((s) => s.orderNotes);
  const setOrderNotes = useCheckoutStore((s) => s.setOrderNotes);
  const selectedAddress = useAddressStore(selectSelectedAddress);

  const paymentMethod = usePaymentStore((s) => s.method);
  const setPaymentMethod = usePaymentStore((s) => s.setMethod);
  const paymentStatus = usePaymentStore((s) => s.status);
  const setPaymentStatus = usePaymentStore((s) => s.setStatus);
  const setPaymentFailure = usePaymentStore((s) => s.setFailure);
  const setPaymentOrder = usePaymentStore((s) => s.setOrder);
  const setPaymentVerification = usePaymentStore((s) => s.setVerification);

  const [step, setStep] = React.useState<Step>(1);
  const [totals, setTotals] = React.useState<CartTotals | null>(null);
  const [orderNotePresets, setOrderNotePresets] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [validationError, setValidationError] = React.useState<string | null>(null);

  const recompute = React.useCallback(async () => {
    const res = await cartRepository.calculateTotals();
    if (res.success) setTotals(res.data);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    void recompute();
  }, [hydrated, lines, fulfillment, promo, recompute]);

  React.useEffect(() => {
    let mounted = true;
    void checkoutRepository.orderNotePresets().then((r) => {
      if (mounted && r.success) setOrderNotePresets(r.data);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!hydrated) return <CheckoutSkeleton />;

  // Empty cart — return to menu.
  if (lines.length === 0) {
    return (
      <AppShell title="Checkout" backTo="/cart" showTabs={false} showTopBar>
        <EmptyState
          icon={<ShoppingBag className="h-8 w-8" aria-hidden />}
          title="Nothing to checkout"
          description="Add items to your cart before continuing."
          actionLabel="Browse menu"
          onAction={() => void navigate({ to: "/menu" })}
        />
      </AppShell>
    );
  }

  const grandTotal = totals?.grandTotal ?? 0;
  const isDelivery = fulfillment === "delivery";

  // Step 1 Validation
  const validateStep1 = (): string | null => {
    if (!activeStore) return "Please choose a kitchen location.";
    if (!fulfillment) return "Please select delivery or takeaway.";
    if (isDelivery && !selectedAddress) {
      return "Please add or select a delivery address.";
    }
    const unavailable = lines.find((l) => l.availability === "unavailable");
    if (unavailable) return `${unavailable.name} is unavailable — please edit your cart.`;
    return null;
  };

  const handleStep1Continue = () => {
    const err = validateStep1();
    if (err) {
      setValidationError(err);
      if (isDelivery && !selectedAddress) {
        void navigate({
          to: "/addresses/create",
          search: { returnTo: "/checkout" },
        });
      }
      return;
    }
    setValidationError(null);
    void HapticService.impact("light");
    setStep(2);
  };

  const handleStep2Continue = () => {
    setValidationError(null);
    void HapticService.impact("light");
    setStep(3);
  };

  const handlePlaceOrder = async () => {
    setValidationError(null);

    // Guest gate
    if (!isAuthenticated) {
      void navigate({
        to: "/auth/login",
        search: { redirect: "/checkout" },
      });
      return;
    }

    setBusy(true);

    // 1. Cart preflight validation
    const validation = await cartRepository.validateCart();
    if (!validation.success || !validation.data.valid) {
      setBusy(false);
      setValidationError(
        validation.success
          ? (validation.data.issues[0]?.message ?? "Some items in your cart are no longer available.")
          : validation.error.message,
      );
      return;
    }

    // 2. Offline Cash Flow (Cash on Delivery / Pay at Store)
    if (paymentMethod === "cash") {
      try {
        const orderStatus: PaymentDisplayStatus = isDelivery ? "CASH_PENDING" : "PAY_AT_STORE";
        const paymentLabel = isDelivery ? "Cash on Delivery" : "Pay at Store";

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
        void cartRepository.clear();
        void navigate({
          to: "/order-confirmation/$orderId",
          params: { orderId: created.data.id },
          replace: true,
        });
      } catch (err) {
        setBusy(false);
        const msg = err instanceof Error ? err.message : "Error placing cash order.";
        setValidationError(msg);
      }
      return;
    }

    // 3. Online Razorpay Flow
    try {
      setPaymentStatus("preparing");
      const orderRes = await paymentRepository.createPaymentOrder();
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
              void cartRepository.clear();
              const orderId = created.success ? created.data.id : verify.data.confirmedOrderId;
              void navigate({
                to: "/order-confirmation/$orderId",
                params: { orderId },
                replace: true,
              });
            } catch (vErr) {
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

  const stepsHeader = [
    { num: 1, label: "Fulfillment & Address" },
    { num: 2, label: "Payment Method" },
    { num: 3, label: "Review & Pay" },
  ];

  return (
    <AppShell
      title="Checkout"
      backTo={step === 1 ? "/cart" : undefined}
      showTabs={false}
      showTopBar
      contentClassName="pb-[calc(140px+env(safe-area-inset-bottom,0px))]"
    >
      <div className="mx-auto max-w-[560px] space-y-4 px-4 py-3">
        {/* Step Progress Indicator */}
        <div className="rounded-[var(--radius-large)] border border-divider bg-surface p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            {stepsHeader.map((s, idx) => {
              const isActive = step === s.num;
              const isPast = step > s.num;
              return (
                <React.Fragment key={s.num}>
                  <button
                    type="button"
                    onClick={() => {
                      if (isPast) {
                        void HapticService.impact("light");
                        setStep(s.num as Step);
                      }
                    }}
                    disabled={!isPast}
                    className={cn(
                      "flex items-center gap-2 text-left focus:outline-none transition-all",
                      isPast && "cursor-pointer",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all",
                        isActive && "bg-primary text-white ring-2 ring-primary/30",
                        isPast && "bg-primary/20 text-primary font-bold",
                        !isActive && !isPast && "bg-bg-secondary text-text-secondary border border-divider",
                      )}
                    >
                      {isPast ? "✓" : s.num}
                    </div>
                    <span
                      className={cn(
                        "text-xs font-semibold hidden sm:inline truncate max-w-[120px]",
                        isActive ? "text-text-primary font-bold" : "text-text-secondary",
                      )}
                    >
                      {s.label}
                    </span>
                  </button>
                  {idx < stepsHeader.length - 1 && (
                    <div
                      className={cn(
                        "h-0.5 flex-1 mx-2 transition-all",
                        step > idx + 1 ? "bg-primary" : "bg-divider",
                      )}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
          <div className="sm:hidden mt-2 text-center text-xs font-bold text-primary">
            Step {step} of 3: {stepsHeader[step - 1]?.label}
          </div>
        </div>

        {/* Validation Alert */}
        {validationError && (
          <div
            role="alert"
            className="rounded-[var(--radius-medium)] border border-error/30 bg-error/10 p-3"
          >
            <Text variant="bodyMedium" tone="error" className="font-semibold">
              {validationError}
            </Text>
          </div>
        )}

        {/* STEP 1: Fulfillment + Address */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Fulfillment Toggle Segmented Bar */}
            <section className="rounded-[var(--radius-large)] border border-divider bg-surface p-4 shadow-sm space-y-3">
              <Text variant="caption" tone="secondary" className="font-semibold uppercase tracking-wider text-[11px]">
                Choose Fulfillment Method
              </Text>

              <div className="grid grid-cols-2 gap-2 p-1 bg-bg-secondary rounded-[var(--radius-medium)] border border-divider">
                <button
                  type="button"
                  onClick={() => {
                    void HapticService.impact("light");
                    setFulfillment("delivery");
                    setValidationError(null);
                  }}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2.5 px-3 rounded-[var(--radius-small)] text-xs font-bold transition-all cursor-pointer",
                    isDelivery
                      ? "bg-primary text-white shadow-sm"
                      : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  <Bike className="h-4 w-4" />
                  <span>Delivery</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void HapticService.impact("light");
                    setFulfillment("takeaway");
                    setValidationError(null);
                  }}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2.5 px-3 rounded-[var(--radius-small)] text-xs font-bold transition-all cursor-pointer",
                    !isDelivery
                      ? "bg-primary text-white shadow-sm"
                      : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  <StoreIcon className="h-4 w-4" />
                  <span>Takeaway</span>
                </button>
              </div>

              {/* Kitchen info */}
              <div className="flex items-start gap-2.5 pt-1 text-xs text-text-secondary">
                <StoreIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-text-primary">{activeStore?.name}</span>
                  <span className="block text-[11px]">{activeStore?.address}</span>
                </div>
              </div>
            </section>

            {/* Delivery Address Section (Delivery Mode Only) */}
            {isDelivery ? (
              <section className="rounded-[var(--radius-large)] border border-divider bg-surface p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <Text variant="titleMedium" className="font-bold">
                    Delivery Address
                  </Text>
                  {selectedAddress && (
                    <Link
                      to="/addresses/create"
                      search={{ returnTo: "/checkout" }}
                      className="text-xs font-bold text-primary hover:underline flex items-center gap-0.5"
                    >
                      <Pencil className="h-3 w-3" /> Change
                    </Link>
                  )}
                </div>

                {selectedAddress ? (
                  <div
                    onClick={() => {
                      void navigate({
                        to: "/addresses/create",
                        search: { editId: selectedAddress.id, returnTo: "/checkout" },
                      });
                    }}
                    className="cursor-pointer"
                  >
                    <AddressCard address={selectedAddress} />
                  </div>
                ) : (
                  <div className="rounded-[var(--radius-medium)] border-2 border-dashed border-divider p-4 text-center space-y-3 bg-bg-secondary/40">
                    <MapPin className="h-8 w-8 text-primary mx-auto" />
                    <div>
                      <p className="text-sm font-bold text-text-primary">No delivery address selected</p>
                      <p className="text-xs text-text-secondary mt-0.5">
                        Add an address to proceed with food delivery
                      </p>
                    </div>
                    <AppButton
                      size="sm"
                      variant="outlined"
                      onClick={() =>
                        void navigate({
                          to: "/addresses/create",
                          search: { returnTo: "/checkout" },
                        })
                      }
                      iconRight={<ChevronRight className="h-4 w-4" />}
                      className="mx-auto"
                    >
                      Add Delivery Address
                    </AppButton>
                  </div>
                )}

                {/* Delivery fee info */}
                <div className="flex items-center justify-between rounded-[var(--radius-medium)] bg-bg-secondary p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Bike className="h-4 w-4 text-text-secondary" />
                    <span>Estimated delivery time</span>
                  </div>
                  <span className="font-bold text-text-primary">~{activeStore?.etaMinutes || 30} mins</span>
                </div>
              </section>
            ) : (
              /* Takeaway Mode Information */
              <section className="rounded-[var(--radius-large)] border border-divider bg-surface p-4 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <StoreIcon className="h-5 w-5 text-primary" />
                  <Text variant="titleMedium" className="font-bold">
                    Store Pickup Details
                  </Text>
                </div>
                <div className="rounded-[var(--radius-medium)] bg-bg-secondary p-3.5 space-y-1">
                  <p className="text-sm font-bold text-text-primary">{activeStore?.name}</p>
                  <p className="text-xs text-text-secondary">{activeStore?.address}</p>
                  <div className="pt-2 flex items-center gap-2 text-xs font-semibold text-emerald-600">
                    <Clock className="h-4 w-4" />
                    <span>Ready for pickup in ~15 minutes</span>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {/* STEP 2: Payment Method */}
        {step === 2 && (
          <div className="space-y-4">
            <section className="rounded-[var(--radius-large)] border border-divider bg-surface p-4 shadow-sm space-y-3">
              <div>
                <Text variant="titleLarge" className="font-bold">
                  How would you like to pay?
                </Text>
                <Text variant="bodySmall" tone="secondary" className="mt-0.5">
                  Select your preferred payment method below.
                </Text>
              </div>

              <PaymentMethodList
                value={paymentMethod}
                onChange={(m) => {
                  void HapticService.impact("light");
                  setPaymentMethod(m);
                }}
              />
            </section>

            <SecurePaymentBadge />
          </div>
        )}

        {/* STEP 3: Review & Pay */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Fulfillment & Payment context recap */}
            <div className="rounded-[var(--radius-large)] border border-divider bg-surface p-3.5 shadow-sm flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 min-w-0">
                {isDelivery ? <Bike className="h-4 w-4 text-primary shrink-0" /> : <StoreIcon className="h-4 w-4 text-primary shrink-0" />}
                <span className="truncate font-semibold text-text-primary">
                  {isDelivery ? `Delivery: ${selectedAddress?.line1 || "Selected address"}` : `Pickup: ${activeStore?.name}`}
                </span>
              </div>
              <AppBadge tone="primary" className="shrink-0 font-bold capitalize">
                {paymentMethod === "online" ? "Online Pay" : "Cash"}
              </AppBadge>
            </div>

            {/* Items summary */}
            <CheckoutSection
              title={`Your order (${itemCount} item${itemCount === 1 ? "" : "s"})`}
              action={
                <Link
                  to="/cart"
                  className="inline-flex items-center gap-1 type-label-large text-primary hover:underline text-xs font-bold"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Link>
              }
            >
              <ReviewItemsList lines={lines} />
            </CheckoutSection>

            {/* Order notes */}
            <CheckoutSection title="Special instructions">
              <NotesEditor
                label="Order instructions"
                value={orderNotes}
                presets={orderNotePresets}
                maxLength={240}
                placeholder="Any special cooking or delivery notes for the kitchen?"
                onChange={setOrderNotes}
                helperText="Shared directly with the kitchen staff."
              />
            </CheckoutSection>

            {/* Coupon / Promo */}
            <CheckoutSection title="Offers & promos">
              <PromoInput applied={promo} onChanged={() => void recompute()} />
            </CheckoutSection>

            {/* Bill breakdown */}
            {totals && <OrderSummary totals={totals} itemCount={itemCount} />}
          </div>
        )}
      </div>

      {/* Sticky Bottom Bar for Wizard Navigation */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-divider bg-surface/95 backdrop-blur-md pb-[calc(10px+env(safe-area-inset-bottom,0px))] shadow-high">
        <div className="mx-auto flex max-w-[560px] items-center justify-between gap-3 px-4 py-3">
          {/* Step 1 Bar */}
          {step === 1 && (
            <>
              <div>
                <p className="text-[11px] text-text-secondary font-medium">Estimated Total</p>
                <p className="type-title-large tabular-nums font-bold text-text-primary">
                  {formatINR(grandTotal)}
                </p>
              </div>
              <AppButton
                size="lg"
                variant="cta"
                onClick={handleStep1Continue}
                iconRight={<ChevronRight className="h-4 w-4" />}
                className="font-bold shadow-brand"
              >
                Continue to Payment
              </AppButton>
            </>
          )}

          {/* Step 2 Bar */}
          {step === 2 && (
            <>
              <AppButton
                size="md"
                variant="outlined"
                onClick={() => setStep(1)}
                iconLeft={<ArrowLeft className="h-4 w-4" />}
                className="font-semibold"
              >
                Back
              </AppButton>
              <AppButton
                size="lg"
                variant="cta"
                onClick={handleStep2Continue}
                iconRight={<ChevronRight className="h-4 w-4" />}
                className="font-bold shadow-brand"
              >
                Review Order
              </AppButton>
            </>
          )}

          {/* Step 3 Bar */}
          {step === 3 && (
            <>
              <AppButton
                size="md"
                variant="outlined"
                onClick={() => setStep(2)}
                iconLeft={<ArrowLeft className="h-4 w-4" />}
                className="font-semibold"
              >
                Back
              </AppButton>
              <div className="text-right">
                <p className="text-[11px] text-text-secondary font-medium">To Pay</p>
                <p className="type-title-large tabular-nums font-bold text-text-primary">
                  {formatINR(grandTotal)}
                </p>
              </div>
              <AppButton
                size="lg"
                variant="cta"
                onClick={() => void handlePlaceOrder()}
                loading={busy}
                iconLeft={!isAuthenticated ? <Lock className="h-4 w-4" /> : undefined}
                className="font-bold shadow-brand"
              >
                {!isAuthenticated
                  ? "Sign In to Pay"
                  : paymentMethod === "online"
                    ? "Pay Online"
                    : isDelivery
                      ? "Place COD Order"
                      : "Place Order"}
              </AppButton>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function CheckoutSkeleton() {
  return (
    <AppShell title="Checkout" backTo="/cart" showTabs={false} showTopBar>
      <div className="mx-auto max-w-[560px] space-y-3 px-4 py-4">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    </AppShell>
  );
}
