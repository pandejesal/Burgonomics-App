import * as React from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { MapPin, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/shared/layouts/AppShell";
import { AppButton } from "@/shared/components/common/AppButton";
import { Text } from "@/shared/components/common/Text";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { FailureState } from "@/shared/components/feedback/FailureState";
import { Skeleton } from "@/shared/components/feedback/Skeleton";
import { ConfirmDialog } from "@/shared/components/common/ConfirmDialog";
import { AppBadge } from "@/shared/components/common/AppBadge";
import { useHydrated } from "@/shared/hooks/useHydrated";
import { formatINR } from "@/core/utils/format";

import {
  cartRepository,
  useCartStore,
  selectItemCount,
  CartItemRow,
  OrderSummary,
  PromoInput,
} from "@/features/cart";
import type { CartTotals } from "@/features/cart/models";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { FulfillmentSheet } from "@/features/stores/components/FulfillmentSheet";
import { FulfillmentChip } from "@/features/stores/components/FulfillmentChip";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your cart — Burgonomics" },
      { name: "description", content: "Review your Burgonomics order before checkout." },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const navigate = useNavigate();
  const hydrated = useHydrated();

  const lines = useCartStore((s) => s.lines);
  const promo = useCartStore((s) => s.promo);
  const status = useCartStore((s) => s.status);
  const error = useCartStore((s) => s.error);
  const itemCount = useCartStore(selectItemCount);
  const activeStore = useStoreSelection((s) => s.activeStore);
  const fulfillment = useStoreSelection((s) => s.fulfillment);
  const setFulfillment = useStoreSelection((s) => s.setFulfillment);

  const [totals, setTotals] = React.useState<CartTotals | null>(null);
  const [computing, setComputing] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [checkoutBusy, setCheckoutBusy] = React.useState(false);
  const [fulfillmentOpen, setFulfillmentOpen] = React.useState(false);

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

  // Error state ----------------------------------------------------
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

  // Empty state ----------------------------------------------------
  if (lines.length === 0) {
    return (
      <AppShell title="Your cart" backTo="/menu" showTabs showTopBar>
        <EmptyState
          icon={<ShoppingBag className="h-8 w-8" aria-hidden />}
          title="Your cart is empty"
          description="Browse the menu and add your favourite items to get started."
          actionLabel="Explore menu"
          onAction={() => navigate({ to: "/menu" })}
        />
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
    toast("Cart cleared", { duration: 1800 });
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

  return (
    <AppShell
      title="Your cart"
      backTo="/menu"
      showTabs
      showTopBar
      contentClassName="pb-[calc(180px+env(safe-area-inset-bottom,0px))]"
      rightSlot={
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          aria-label="Clear cart"
          className="grid h-11 w-11 place-items-center rounded-full text-text-secondary hover:bg-bg-secondary hover:text-error"
        >
          <Trash2 className="h-5 w-5" aria-hidden />
        </button>
      }
      bottomSlot={
        <div className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] z-30 border-t border-divider bg-surface backdrop-blur shadow-md">
          <div className="mx-auto flex max-w-[480px] md:max-w-[480px] max-md:max-w-full items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="type-caption text-text-secondary">Grand total</p>
              <p className="type-title-large tabular-nums">{formatINR(totals?.grandTotal ?? 0)}</p>
            </div>
            <AppButton
              variant="primary"
              size="md"
              onClick={() => void onCheckout()}
              loading={checkoutBusy}
              disabled={lines.length === 0}
            >
              Proceed to checkout
            </AppButton>
          </div>
        </div>
      }
    >
      <div className="mx-auto max-w-[520px] space-y-4 px-4 py-4">
        {/* Store header */}
        {activeStore && (
          <Link
            to="/stores"
            aria-label={`Order from ${activeStore.name}. Tap to change store.`}
            className="flex items-center gap-3 rounded-[var(--radius-large)] border border-divider bg-surface p-3 hover:border-primary/40"
          >
            <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
              <MapPin className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <Text variant="titleMedium" className="truncate">
                {activeStore.name}
              </Text>
              <Text variant="caption" tone="secondary" className="truncate">
                {activeStore.area} · {activeStore.etaMinutes} min
              </Text>
            </div>
            <AppBadge tone={activeStore.isOpen ? "success" : "neutral"}>
              {activeStore.isOpen ? "Open" : "Closed"}
            </AppBadge>
          </Link>
        )}

        {/* Fulfillment — display current selection; tap to change. */}
        <section
          aria-labelledby="fulfil-heading"
          className="flex items-center justify-between gap-3 rounded-[var(--radius-large)] border border-divider bg-surface p-3"
        >
          <div className="min-w-0">
            <Text id="fulfil-heading" variant="caption" tone="secondary">
              Order method
            </Text>
            <Text variant="titleMedium" className="truncate">
              {fulfillment === "delivery" && "Delivery"}
              {fulfillment === "takeaway" && "Takeaway"}
              {fulfillment === "dinein" && "Dine-In"}
              {!fulfillment && "Choose a method"}
            </Text>
          </div>
          <FulfillmentChip value={fulfillment} onClick={() => setFulfillmentOpen(true)} />
        </section>

        {/* Items */}
        <section aria-labelledby="items-heading" className="space-y-2">
          <div className="flex items-center justify-between">
            <Text id="items-heading" variant="titleMedium">
              Items ({itemCount})
            </Text>
            {computing && (
              <Text variant="caption" tone="secondary">
                Updating…
              </Text>
            )}
          </div>
          <div className="space-y-2">
            {lines.map((line) => (
              <CartItemRow
                key={line.lineId}
                line={line}
                onQuantityChange={(q) => void onQuantity(line.lineId, q)}
                onRemove={() => void onRemove(line.lineId, line.name)}
                onNotesChange={(n) => void onNotes(line.lineId, n)}
              />
            ))}
          </div>
          <div className="pt-1">
            <Link to="/menu" className="type-body-medium text-primary hover:underline">
              + Add more items
            </Link>
          </div>
        </section>

        {/* Promo */}
        <section aria-labelledby="promo-heading" className="space-y-2">
          <Text id="promo-heading" variant="titleMedium">
            Offers & promos
          </Text>
          <PromoInput applied={promo} onChanged={() => void recompute()} />
        </section>

        {/* Summary */}
        {totals && <OrderSummary totals={totals} itemCount={itemCount} />}
        <div className="h-24" aria-hidden="true" />
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
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </AppShell>
  );
}
