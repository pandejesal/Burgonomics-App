import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RefreshCw, ShoppingBag, Tag } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/shared/layouts/AppShell";
import { Text } from "@/shared/components/common/Text";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { FailureState } from "@/shared/components/feedback/FailureState";
import { Skeleton } from "@/shared/components/feedback/Skeleton";
import { PetpoojaSyncPlaceholder } from "@/shared/components/feedback/PetpoojaSyncPlaceholder";
import { useDemoStore } from "@/features/demo/state/demoStore";

import {
  offerRepository,
  useOffersStore,
  OfferListCard,
  CouponInput,
  OfferTermsSheet,
} from "@/features/offers";
import type { Offer, OfferType } from "@/features/offers/models";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useCartStore, selectHasItems, cartRepository } from "@/features/cart";

/**
 * SCR — Offers.
 *
 * 100% repository-driven. This screen NEVER authors an offer: it
 * requests them from `OfferRepository` (which will call PETPOOJA via
 * the backend) and renders whatever comes back grouped by `type`.
 * Sections only appear when the repository returns at least one item.
 */
export const Route = createFileRoute("/offers")({
  head: () => ({
    meta: [
      { title: "Offers — Burgonomics" },
      {
        name: "description",
        content: "Coupons, combos, and limited-time promos, synced from PETPOOJA.",
      },
    ],
  }),
  component: OffersPage,
});

const SECTION_ORDER: Array<{
  key: "active" | OfferType;
  title: string;
  match: (o: Offer) => boolean;
}> = [
  {
    key: "automatic",
    title: "Automatic discounts",
    match: (o) => o.automatic,
  },
  {
    key: "coupon",
    title: "Coupon codes",
    match: (o) => !o.automatic && !!o.code,
  },
  {
    key: "combo",
    title: "Combo offers",
    match: (o) => o.type === "combo",
  },
  {
    key: "delivery",
    title: "Delivery offers",
    match: (o) => o.type === "delivery",
  },
  {
    key: "takeaway",
    title: "Takeaway offers",
    match: (o) => o.type === "takeaway",
  },
  {
    key: "dinein",
    title: "Dine-in offers",
    match: (o) => o.type === "dinein",
  },
  {
    key: "store",
    title: "Store-specific offers",
    match: (o) => o.type === "store",
  },
  {
    key: "first_order",
    title: "First-order rewards",
    match: (o) => o.type === "first_order",
  },
  {
    key: "festival",
    title: "Festival specials",
    match: (o) => o.type === "festival",
  },
  {
    key: "limited_time",
    title: "Limited time",
    match: (o) => o.type === "limited_time",
  },
];

function OffersPage() {
  const navigate = useNavigate();

  const storeId = useStoreSelection((s) => s.activeStore?.id);
  const fulfillment = useStoreSelection((s) => s.fulfillment);

  const status = useOffersStore((s) => s.status);
  const offers = useOffersStore((s) => s.offers);
  const fetchedAt = useOffersStore((s) => s.fetchedAt);
  const error = useOffersStore((s) => s.error);
  const load = useOffersStore((s) => s.load);
  const simulationMode = useDemoStore((s) => s.simulationMode);

  const promo = useCartStore((s) => s.promo);
  const hasItems = useCartStore(selectHasItems);

  const [termsOffer, setTermsOffer] = React.useState<Offer | null>(null);
  const [termsOpen, setTermsOpen] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [coupon, setCoupon] = React.useState<{
    busy: boolean;
    error: string | null;
    success: string | null;
  }>({ busy: false, error: null, success: null });

  // Initial + context-aware load. Never cached longer than the repo TTL.
  React.useEffect(() => {
    void load({ storeId, fulfillment: fulfillment ?? undefined });
  }, [storeId, fulfillment, load]);

  const onRefresh = () => load({ storeId, fulfillment: fulfillment ?? undefined }, { force: true });

  const openTerms = (offer: Offer) => {
    setTermsOffer(offer);
    setTermsOpen(true);
  };

  const applyOffer = async (offer: Offer) => {
    if (!hasItems) {
      toast.error("Add items to your cart before applying an offer.");
      return;
    }
    setBusyId(offer.id);
    const res = await cartRepository.applyPromo({ offerId: offer.id });
    setBusyId(null);
    if (!res.success) {
      toast.error(res.error.message);
      return;
    }
    toast.success(res.data.savingsLabel ?? `${offer.title} applied.`, { duration: 2500 });
  };

  const removeOffer = async () => {
    setBusyId(promo?.offerId ?? "current");
    await cartRepository.removePromo();
    setBusyId(null);
    toast("Offer removed", { duration: 2000 });
  };

  const submitCoupon = async (code: string) => {
    if (!hasItems) {
      setCoupon({
        busy: false,
        error: "Add items to your cart before applying a coupon.",
        success: null,
      });
      return;
    }
    setCoupon({ busy: true, error: null, success: null });
    // Validation then apply — both delegated to the repository.
    const validate = await offerRepository.validateCoupon(code, {
      storeId,
      fulfillment: fulfillment ?? undefined,
      subtotal: 0,
    });
    if (!validate.success) {
      setCoupon({ busy: false, error: validate.error.message, success: null });
      return;
    }
    const applied = await cartRepository.applyPromo({ code });
    if (!applied.success) {
      setCoupon({ busy: false, error: applied.error.message, success: null });
      return;
    }
    setCoupon({
      busy: false,
      error: null,
      success: applied.data.savingsLabel ?? `${applied.data.description ?? code} applied.`,
    });
  };

  const sections = React.useMemo(() => {
    const claimed = new Set<string>();
    const result: Array<{ title: string; items: Offer[] }> = [];
    for (const s of SECTION_ORDER) {
      const items = offers.filter((o) => !claimed.has(o.id) && s.match(o));
      if (items.length === 0) continue;
      items.forEach((o) => claimed.add(o.id));
      result.push({ title: s.title, items });
    }
    const rest = offers.filter((o) => !claimed.has(o.id));
    if (rest.length > 0) result.push({ title: "Other offers", items: rest });
    return result;
  }, [offers]);

  const lastUpdated = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <AppShell
      title="Offers"
      showTabs
      showTopBar
      rightSlot={
        <button
          type="button"
          onClick={() => void onRefresh()}
          aria-label="Refresh offers"
          className="grid h-11 w-11 place-items-center rounded-full text-text-secondary hover:bg-bg-secondary"
        >
          <RefreshCw
            className={
              status === "refreshing" || status === "loading" ? "h-5 w-5 animate-spin" : "h-5 w-5"
            }
            aria-hidden
          />
        </button>
      }
    >
      <div className="mx-auto max-w-[560px] space-y-4 px-4 py-4">
        {/* Applied offer summary */}
        {promo && (
          <section
            aria-label="Currently applied offer"
            className="rounded-[var(--radius-large)] border border-success/40 bg-success/5 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Text variant="titleMedium" className="truncate">
                  {promo.description ?? promo.code} applied
                </Text>
                <Text variant="caption" tone="secondary" className="truncate">
                  {promo.code} · {promo.savingsLabel ?? `Savings applied to cart`}
                </Text>
              </div>
              <button
                type="button"
                onClick={() => void removeOffer()}
                className="type-label-large text-error hover:underline"
              >
                Remove
              </button>
            </div>
          </section>
        )}

        {/* Coupon entry */}
        <section aria-labelledby="coupon-heading" className="space-y-2">
          <Text id="coupon-heading" variant="titleMedium">
            Have a coupon?
          </Text>
          <CouponInput
            onSubmit={submitCoupon}
            busy={coupon.busy}
            error={coupon.error}
            success={coupon.success}
            onClearMessage={() => setCoupon({ busy: false, error: null, success: null })}
          />
        </section>

        {/* Loading */}
        {(status === "loading" || status === "idle") && <OffersSkeleton />}

        {/* Error */}
        {status === "error" && (
          <FailureState
            title="We couldn't load offers"
            message={error ?? "Please try again."}
            onRetry={() => void onRefresh()}
          />
        )}

        {/* Empty */}
        {status === "empty" &&
          (!simulationMode ? (
            <PetpoojaSyncPlaceholder storeId={storeId || undefined} />
          ) : (
            <EmptyState
              icon={<Tag className="h-8 w-8" aria-hidden />}
              title="No offers right now"
              description="Check back soon — offers are refreshed every few minutes."
              actionLabel={hasItems ? "Back to cart" : "Explore menu"}
              onAction={() => navigate({ to: hasItems ? "/cart" : "/menu" })}
            />
          ))}

        {/* Sections */}
        {(status === "ready" || status === "refreshing") &&
          sections.map((section) => (
            <section key={section.title} aria-label={section.title} className="space-y-2">
              <Text variant="titleMedium">{section.title}</Text>
              <div className="space-y-2">
                {section.items.map((offer) => (
                  <OfferListCard
                    key={offer.id}
                    offer={offer}
                    applied={promo?.offerId === offer.id}
                    busy={busyId === offer.id}
                    disabled={!hasItems && !offer.automatic}
                    onApply={applyOffer}
                    onRemove={() => void removeOffer()}
                    onViewTerms={openTerms}
                  />
                ))}
              </div>
            </section>
          ))}

        {/* No cart hint */}
        {!hasItems && status === "ready" && (
          <div className="flex items-start gap-3 rounded-[var(--radius-medium)] border border-divider bg-bg-secondary p-3">
            <ShoppingBag className="mt-0.5 h-4 w-4 text-text-secondary" aria-hidden />
            <Text variant="caption" tone="secondary">
              Add items to your cart to apply an offer at checkout.
            </Text>
          </div>
        )}

        {lastUpdated && (status === "ready" || status === "refreshing" || status === "empty") && (
          <Text variant="caption" tone="secondary" className="block text-center">
            Offers synced at {lastUpdated} · refreshes every few minutes
          </Text>
        )}
      </div>

      <OfferTermsSheet
        offer={termsOffer}
        open={termsOpen}
        onOpenChange={(o) => {
          setTermsOpen(o);
          if (!o) setTermsOffer(null);
        }}
      />
    </AppShell>
  );
}

function OffersSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading offers">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-[var(--radius-large)]" />
      ))}
    </div>
  );
}
