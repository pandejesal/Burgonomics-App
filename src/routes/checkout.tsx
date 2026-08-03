import * as React from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { MapPin, Clock, ShoppingBag, Pencil, Lock } from "lucide-react";

import { AppShell } from "@/shared/layouts/AppShell";
import { AppButton } from "@/shared/components/common/AppButton";
import { AppBadge } from "@/shared/components/common/AppBadge";
import { Text } from "@/shared/components/common/Text";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { Skeleton } from "@/shared/components/feedback/Skeleton";
import { useHydrated } from "@/shared/hooks/useHydrated";
import { formatINR } from "@/core/utils/format";

import {
  cartRepository,
  useCartStore,
  selectItemCount,
  OrderSummary,
  PromoInput,
} from "@/features/cart";
import type { CartTotals } from "@/features/cart/models";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { FulfillmentChip } from "@/features/stores/components/FulfillmentChip";
import { FulfillmentSheet } from "@/features/stores/components/FulfillmentSheet";
import { useAuthStore } from "@/features/auth/state/authStore";
import {
  CheckoutSection,
  DeliveryPanel,
  TakeawayPanel,
  DineInPanel,
  ReviewItemsList,
  NotesEditor,
  checkoutRepository,
  useCheckoutStore,
} from "@/features/checkout";
import { useAddressStore, selectSelectedAddress } from "@/features/addresses";

/**
 * SCR — Checkout.
 *
 * Public screen. Guests can review their order end-to-end; the auth
 * gate only fires when the user taps "Continue to payment". On sign-in
 * the OTP screen replays `?redirect=/checkout`, so cart, store,
 * fulfillment, address, and notes are all preserved by their
 * respective persisted stores.
 *
 * The screen composes three fulfillment-specific panels behind a
 * shared frame — DeliveryPanel, TakeawayPanel, DineInPanel — so
 * adding a future fulfillment method (curbside, scheduled) is a
 * one-component change.
 */
export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — Burgonomics" },
      { name: "description", content: "Review your order and continue to payment." },
    ],
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const navigate = useNavigate();
  const hydrated = useHydrated();

  const lines = useCartStore((s) => s.lines);
  const promo = useCartStore((s) => s.promo);
  const itemCount = useCartStore(selectItemCount);

  const activeStore = useStoreSelection((s) => s.activeStore);
  const fulfillment = useStoreSelection((s) => s.fulfillment);
  const setFulfillment = useStoreSelection((s) => s.setFulfillment);

  const isAuthenticated = useAuthStore((s) => s.status === "authenticated" && !!s.accessToken);

  const orderNotes = useCheckoutStore((s) => s.orderNotes);
  const setOrderNotes = useCheckoutStore((s) => s.setOrderNotes);
  const selectedAddress = useAddressStore(selectSelectedAddress);

  const [totals, setTotals] = React.useState<CartTotals | null>(null);
  const [fulfillmentOpen, setFulfillmentOpen] = React.useState(false);
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

  // Empty cart — bounce user back to menu.
  if (lines.length === 0) {
    return (
      <AppShell title="Checkout" backTo="/cart" showTabs={false} showTopBar>
        <EmptyState
          icon={<ShoppingBag className="h-8 w-8" aria-hidden />}
          title="Nothing to checkout"
          description="Add items to your cart before continuing."
          actionLabel="Browse menu"
          onAction={() => navigate({ to: "/menu" })}
        />
      </AppShell>
    );
  }

  const grandTotal = totals?.grandTotal ?? 0;
  const deliveryFee = totals?.deliveryFee ?? 0;

  const validate = (): string | null => {
    if (!activeStore) return "Choose a store to continue.";
    if (!fulfillment) return "Choose a fulfillment method.";
    if (fulfillment === "delivery" && !selectedAddress) {
      return "Add a delivery address to continue.";
    }
    const unavailable = lines.find((l) => l.availability === "unavailable");
    if (unavailable) return `${unavailable.name} is unavailable — please edit your cart.`;
    return null;
  };

  const onContinue = async () => {
    // If not authenticated, allow tapping "Sign in to continue" without being blocked by missing delivery address
    if (!isAuthenticated) {
      if (!activeStore) {
        setValidationError("Choose a store to continue.");
        return;
      }
      if (!fulfillment) {
        setValidationError("Choose a fulfillment method.");
        return;
      }
      const unavailable = lines.find((l) => l.availability === "unavailable");
      if (unavailable) {
        setValidationError(`${unavailable.name} is unavailable — please edit your cart.`);
        return;
      }
      setValidationError(null);
      void navigate({
        to: "/auth/login",
        search: { redirect: selectedAddress ? "/payment" : "/checkout" },
      });
      return;
    }

    const err = validate();
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    setBusy(true);
    const validation = await cartRepository.validateCart();
    if (!validation.success || !validation.data.valid) {
      setBusy(false);
      setValidationError(
        validation.success
          ? (validation.data.issues[0]?.message ?? "Some items are no longer available.")
          : validation.error.message,
      );
      return;
    }
    setBusy(false);
    void navigate({ to: "/payment" });
  };

  const fulfillmentLabel =
    fulfillment === "delivery"
      ? "Delivery"
      : fulfillment === "takeaway"
        ? "Takeaway"
        : fulfillment === "dinein"
          ? "Dine-in"
          : "Choose method";

  const eta =
    fulfillment === "delivery"
      ? activeStore?.etaMinutes
      : (activeStore?.pickupEtaMinutes ?? activeStore?.etaMinutes);

  return (
    <AppShell
      title="Checkout"
      backTo="/cart"
      showTabs={false}
      showTopBar
      contentClassName="pb-[calc(140px+env(safe-area-inset-bottom,0px))]"
      bottomSlot={
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-divider bg-surface/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur">
          <div className="mx-auto flex max-w-[560px] md:max-w-[560px] max-md:max-w-full items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="type-caption text-text-secondary">Grand total</p>
              <p className="type-title-large tabular-nums">{formatINR(grandTotal)}</p>
            </div>
            <AppButton
              size="lg"
              onClick={() => void onContinue()}
              loading={busy}
              iconLeft={!isAuthenticated ? <Lock className="h-4 w-4" aria-hidden /> : undefined}
            >
              {isAuthenticated ? "Continue to payment" : "Sign in to continue"}
            </AppButton>
          </div>
        </div>
      }
    >
      <div className="mx-auto max-w-[560px] space-y-4 px-4 py-4">
        {/* Guest sign in banner */}
        {!isAuthenticated && (
          <div className="rounded-[var(--radius-medium)] border border-primary/20 bg-primary/5 p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary shrink-0" />
              <Text variant="bodySmall" className="text-text-primary font-medium">
                Have an account? Sign in to use saved addresses.
              </Text>
            </div>
            <Link
              to="/auth/login"
              search={{ redirect: "/checkout" }}
              className="type-label-large text-primary font-bold hover:underline shrink-0"
            >
              Sign in
            </Link>
          </div>
        )}
        {/* Store header + fulfillment method */}
        <section
          aria-label="Order context"
          className="rounded-[var(--radius-large)] border border-divider bg-surface p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Text variant="caption" tone="secondary">
                {fulfillment === "delivery" ? "Delivering from" : "Order from"}
              </Text>
              {activeStore ? (
                <>
                  <Text variant="titleLarge" className="mt-0.5 truncate">
                    {activeStore.name}
                  </Text>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-1 text-text-secondary">
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      <Text variant="caption" tone="secondary">
                        {activeStore.area}
                      </Text>
                    </div>
                    {eta ? (
                      <div className="inline-flex items-center gap-1 text-text-secondary">
                        <Clock className="h-3.5 w-3.5" aria-hidden />
                        <Text variant="caption" tone="secondary">
                          ~{eta} min
                        </Text>
                      </div>
                    ) : null}
                    <AppBadge tone={activeStore.isOpen ? "success" : "warning"}>
                      {activeStore.isOpen ? "Open" : "Closed"}
                    </AppBadge>
                  </div>
                </>
              ) : (
                <>
                  <Text variant="titleLarge" className="mt-0.5">
                    No store selected
                  </Text>
                  <Link to="/stores" className="type-label-large text-primary hover:underline">
                    Choose a store
                  </Link>
                </>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <Text variant="caption" tone="secondary">
                {fulfillmentLabel}
              </Text>
              <FulfillmentChip value={fulfillment} onClick={() => setFulfillmentOpen(true)} />
            </div>
          </div>
        </section>

        {/* Fulfillment-specific panel */}
        {fulfillment === "delivery" && (
          <DeliveryPanel
            store={activeStore}
            deliveryFee={deliveryFee}
            onAddressChange={() => setValidationError(null)}
          />
        )}
        {fulfillment === "takeaway" && <TakeawayPanel store={activeStore} />}
        {fulfillment === "dinein" && <DineInPanel store={activeStore} />}

        {/* Review items */}
        <CheckoutSection
          title={`Your order (${itemCount})`}
          action={
            <Link
              to="/cart"
              className="inline-flex items-center gap-1 type-label-large text-primary hover:underline"
            >
              <Pencil className="h-4 w-4" aria-hidden /> Edit
            </Link>
          }
        >
          <ReviewItemsList lines={lines} />
        </CheckoutSection>

        {/* Order-level notes */}
        <CheckoutSection title="Special instructions">
          <NotesEditor
            label="Order-level notes"
            value={orderNotes}
            presets={orderNotePresets}
            maxLength={240}
            placeholder="Anything else the kitchen should know?"
            onChange={setOrderNotes}
            helperText="Applies to the whole order (separate from per-item notes)."
          />
        </CheckoutSection>

        {/* Promo */}
        <CheckoutSection title="Offers & promos">
          <PromoInput applied={promo} onChanged={() => void recompute()} />
        </CheckoutSection>

        {/* Summary */}
        {totals && <OrderSummary totals={totals} itemCount={itemCount} />}

        {validationError && (
          <div
            role="alert"
            className="rounded-[var(--radius-medium)] border border-warning/40 bg-warning/10 p-3"
          >
            <Text variant="bodyMedium" tone="error">
              {validationError}
            </Text>
          </div>
        )}
        <div className="h-28" aria-hidden="true" />
      </div>

      <FulfillmentSheet
        open={fulfillmentOpen}
        onOpenChange={setFulfillmentOpen}
        store={activeStore}
        value={fulfillment}
        onConfirm={(f) => {
          setFulfillment(f);
          setFulfillmentOpen(false);
          setValidationError(null);
        }}
      />
    </AppShell>
  );
}

function CheckoutSkeleton() {
  return (
    <AppShell title="Checkout" backTo="/cart" showTabs={false} showTopBar>
      <div className="mx-auto max-w-[560px] space-y-3 px-4 py-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </AppShell>
  );
}
