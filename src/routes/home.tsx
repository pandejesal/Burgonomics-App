import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Bell, Search } from "lucide-react";
import { toast } from "sonner";
import { HapticService } from "@/core/services/haptics";

import { AppShell } from "@/shared/layouts/AppShell";
import { Text } from "@/shared/components/common/Text";
import { ProductCard } from "@/shared/components/common/ProductCard";
import { OfferCard } from "@/shared/components/common/OfferCard";
import { FailureState } from "@/shared/components/feedback/FailureState";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { PetpoojaSyncPlaceholder } from "@/shared/components/feedback/PetpoojaSyncPlaceholder";

import { useStoreSelection } from "@/features/stores/state/storeStore";
import { FulfillmentSheet } from "@/features/stores/components/FulfillmentSheet";
import { FulfillmentChip } from "@/features/stores/components/FulfillmentChip";
import { useAuthStore, selectIsAuthenticated } from "@/features/auth/state/authStore";
import { useDemoStore } from "@/features/demo/state/demoStore";

import { useHomeStore } from "@/features/home";
import { BannerCarousel } from "@/features/home/components/BannerCarousel";
import { CategoryGrid } from "@/features/home/components/CategoryGrid";
import { HorizontalRail } from "@/features/home/components/HorizontalRail";
import { SectionHeader } from "@/features/home/components/SectionHeader";
import { ComboCard } from "@/features/home/components/ComboCard";
import { QuickReorderRail } from "@/features/home/components/QuickReorderRail";
import { StoreHeaderCard } from "@/features/home/components/StoreHeaderCard";
import { HomeSkeleton } from "@/features/home/components/HomeSkeleton";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { useGsapReveal } from "@/shared/hooks/useGsapReveal";
import { useAppConfig } from "@/core/state/appConfigStore";
import { cartRepository } from "@/features/cart/repositories/CartRepository";
import { isNative } from "@/shared/platform/platform";
import type { Product } from "@/features/menu/models";

/**
 * SCR-005 Home. Requires a selected store — the store determines all
 * downstream content (menu, offers, ETA). If none is set (e.g. deep
 * link, storage cleared) the user is bounced to Store Selection.
 */
export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "Home — Burgonomics (100% Pure Vegetarian)" },
      {
        name: "description",
        content:
          "Today's featured menu, combos, and offers from your nearest Burgonomics — a 100% Pure Vegetarian kitchen.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  useOnlineStatus();
  const online = useAppConfig((s) => s.isOnline);
  const store = useStoreSelection((s) => s.activeStore);
  const isHydrated = useStoreSelection((s) => s.isHydrated);

  const sectionsRef = useGsapReveal({ yOffset: 30, duration: 0.8, stagger: 0.15 });

  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const user = useAuthStore((s) => s.user);

  const fulfillment = useStoreSelection((s) => s.fulfillment);
  const setFulfillment = useStoreSelection((s) => s.setFulfillment);
  const [fulfillmentOpen, setFulfillmentOpen] = useState(false);

  const status = useHomeStore((s) => s.status);
  const bundle = useHomeStore((s) => s.bundle);
  const error = useHomeStore((s) => s.error);
  const load = useHomeStore((s) => s.load);
  const simulationMode = useDemoStore((s) => s.simulationMode);

  // Bounce guests without a chosen store to Store Selection.
  useEffect(() => {
    if (isHydrated && !store) {
      void navigate({ to: "/stores", replace: true });
    }
  }, [isHydrated, store, navigate]);

  // Fulfillment gate — must be chosen before the user can browse Home.
  useEffect(() => {
    if (store && !fulfillment) setFulfillmentOpen(true);
  }, [store, fulfillment]);

  // Load / reload on store change.
  useEffect(() => {
    if (store) {
      void load(store.id, user?.id);
    }
  }, [store, user?.id, load]);

  const handleAddToCart = useCallback(
    (product: Product) => {
      if (product.customizable) {
        void navigate({ to: "/menu/product/$productId", params: { productId: product.id } });
        return;
      }
      if (!store) return;
      void cartRepository.addItem({
        storeId: store.id,
        productId: product.id,
        name: product.name,
        imageUrl: product.imageUrl,
        fallbackImageUrl: product.fallbackImageUrl,
        veg: product.veg,
        unitPrice: product.price,
        quantity: 1,
      });

      void HapticService.impact("medium");

      toast(`✓ ${product.name} added`, {
        action: {
          label: "View Cart",
          onClick: () => {
            void navigate({ to: "/cart" });
          },
        },
        duration: 3500,
      });
    },
    [store, navigate],
  );

  const handleCardClick = useCallback(
    (productId: string) => {
      void navigate({ to: "/menu/product/$productId", params: { productId } });
    },
    [navigate],
  );

  if (!store) return null;

  const isLoading = status === "loading" || (status === "idle" && !bundle);
  const isRefreshing = status === "refreshing";

  const handleRefresh = async () => {
    if (!store) return;
    await load(store.id, user?.id, { refresh: true });
  };

  return (
    <AppShell
      title="BURGONOMICS"
      showTabs
      showTopBar
      rightSlot={
        <Link
          to="/profile/notifications"
          aria-label="Notifications"
          className="grid h-11 w-11 place-items-center rounded-full hover:bg-bg-secondary"
        >
          <Bell className="h-5 w-5" aria-hidden />
        </Link>
      }
    >
      <div className="mx-auto max-w-[520px]">
        {/* Clean Light Header Block */}
        <div className="bg-surface border-b border-divider shadow-low pb-5 pt-3 relative z-10">
          {/* Store header + fulfillment chip */}
          <div className="space-y-2 px-4">
            <StoreHeaderCard store={store} fulfillment={fulfillment} />
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FulfillmentChip value={fulfillment} onClick={() => setFulfillmentOpen(true)} />
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-success">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                  <span className="type-caption font-medium">100% Pure Veg</span>
                </span>
              </div>
              {fulfillment === "delivery" && (
                <Text variant="caption" tone="secondary">
                  ETA {store.etaMinutes} min
                </Text>
              )}
              {fulfillment === "takeaway" && (
                <Text variant="caption" tone="secondary">
                  Ready in {store.pickupEtaMinutes ?? Math.max(8, Math.floor(store.etaMinutes / 2))}{" "}
                  min
                </Text>
              )}
              {fulfillment === "dinein" && (
                <Text variant="caption" tone="secondary">
                  {store.isOpen ? "Open now" : "Closed"}
                </Text>
              )}
            </div>
          </div>

          {/* Search */}
          <section className="mt-3 px-4">
            <Link
              to="/search"
              aria-label="Search the menu"
              className="flex h-11 items-center gap-2 rounded-full border border-divider bg-bg-secondary px-4 hover:border-primary/40 transition-colors shadow-low float-interactive"
            >
              <Search className="h-5 w-5 text-text-secondary" aria-hidden />
              <span className="type-body-large text-text-secondary">Search the menu…</span>
            </Link>
          </section>
        </div>

        {/* Offline strip */}
        {!online && (
          <div className="mt-4 px-4">
            <div
              role="status"
              className="rounded-[var(--radius-medium)] border border-warning/40 bg-warning/10 p-3 type-body-medium font-medium text-amber-900 dark:text-amber-200"
            >
              You are offline. Showing the latest available content.
            </div>
          </div>
        )}

        {/* Body */}
        {isLoading ? (
          <div className="mt-4">
            <HomeSkeleton />
          </div>
        ) : status === "error" && !bundle ? (
          <div className="mt-6">
            <FailureState
              title="We couldn't load Home"
              message={error ?? "Please try again in a moment."}
              onRetry={handleRefresh}
            />
          </div>
        ) : status === "empty" || !bundle ? (
          !simulationMode ? (
            <div className="mt-4">
              <PetpoojaSyncPlaceholder storeId={store.id} />
            </div>
          ) : (
            <EmptyState
              title="Nothing to show yet"
              description="Menu and offers for this store will appear here soon."
              actionLabel="Browse menu"
              onAction={() => navigate({ to: "/menu" })}
            />
          )
        ) : (
          <div ref={sectionsRef} className="mt-5 space-y-7 pb-6 touch-pan-y">
            {/* Banners */}
            {bundle.banners.length > 0 && <BannerCarousel banners={bundle.banners} />}

            {/* Categories */}
            {bundle.categories.length > 0 && (
              <section aria-labelledby="cats-heading">
                <SectionHeader
                  title="What's on your plate?"
                  subtitle="Browse by category"
                  actionLabel="See menu"
                  actionTo="/menu"
                />
                <CategoryGrid categories={bundle.categories} />
              </section>
            )}

            {/* Featured offers */}
            {bundle.featuredOffers.length > 0 && (
              <section aria-labelledby="offers-heading">
                <SectionHeader
                  title="Featured offers"
                  subtitle="Save on today's favourites"
                  actionLabel="All offers"
                  actionTo="/offers"
                />
                <HorizontalRail ariaLabel="Featured offers">
                  {bundle.featuredOffers.map((o) => (
                    <OfferCard
                      key={o.id}
                      code={o.code ?? ""}
                      title={o.title}
                      description={o.description}
                      className="w-[280px]"
                    />
                  ))}
                </HorizontalRail>
              </section>
            )}

            {/* Quick reorder */}
            {isAuthenticated && bundle.quickReorder.length > 0 && (
              <section aria-labelledby="reorder-heading">
                <SectionHeader
                  title="Reorder in one tap"
                  subtitle="From your recent orders"
                  actionLabel="View orders"
                  actionTo="/orders"
                />
                <QuickReorderRail items={bundle.quickReorder} />
              </section>
            )}

            {/* Best sellers */}
            {bundle.bestSellers.length > 0 && (
              <section aria-labelledby="best-heading">
                <SectionHeader
                  title="Best sellers"
                  subtitle="Most loved at this store"
                  actionLabel="See all"
                  actionTo="/menu"
                />
                <HorizontalRail ariaLabel="Best selling items">
                  {bundle.bestSellers.map((it) => (
                    <ProductCard
                      key={it.id}
                      id={it.id}
                      name={it.name}
                      description={it.description}
                      price={it.price}
                      veg={it.veg}
                      imageUrl={it.imageUrl}
                      fallbackImageUrl={it.fallbackImageUrl}
                      inStock={it.inStock}
                      onAdd={() => handleAddToCart(it)}
                      onClickCard={() => handleCardClick(it.id)}
                      className="w-[200px]"
                    />
                  ))}
                </HorizontalRail>
              </section>
            )}

            {/* Popular combos */}
            {bundle.popularCombos.length > 0 && (
              <section aria-labelledby="combos-heading">
                <SectionHeader
                  title="Popular combos"
                  subtitle="Bundle up and save more"
                  actionLabel="See all"
                  actionTo="/menu"
                />
                <HorizontalRail ariaLabel="Popular combos">
                  {bundle.popularCombos.map((c) => (
                    <ComboCard key={c.id} combo={c} />
                  ))}
                </HorizontalRail>
              </section>
            )}

            {/* Recommendations */}
            {bundle.recommendations.length > 0 && (
              <section aria-labelledby="recs-heading">
                <SectionHeader
                  title="Recommended for you"
                  subtitle="Picked from what you'll likely enjoy"
                />
                <HorizontalRail ariaLabel="Recommended items">
                  {bundle.recommendations.map((it) => (
                    <ProductCard
                      key={it.id}
                      id={it.id}
                      name={it.name}
                      description={it.reason ?? it.description}
                      price={it.price}
                      veg={it.veg}
                      imageUrl={it.imageUrl}
                      fallbackImageUrl={it.fallbackImageUrl}
                      inStock={it.inStock}
                      onAdd={() => handleAddToCart(it)}
                      onClickCard={() => handleCardClick(it.id)}
                      className="w-[200px]"
                    />
                  ))}
                </HorizontalRail>
              </section>
            )}

            {/* Recently viewed — only when populated */}
            {bundle.recentlyViewed.length > 0 && (
              <section aria-labelledby="recent-heading">
                <SectionHeader title="Recently viewed" subtitle="Pick up where you left off" />
                <HorizontalRail ariaLabel="Recently viewed items">
                  {bundle.recentlyViewed.map((it) => (
                    <ProductCard
                      key={it.id}
                      id={it.id}
                      name={it.name}
                      description={it.description}
                      price={it.price}
                      veg={it.veg}
                      imageUrl={it.imageUrl}
                      fallbackImageUrl={it.fallbackImageUrl}
                      inStock={it.inStock}
                      onAdd={() => handleAddToCart(it)}
                      onClickCard={() => handleCardClick(it.id)}
                      className="w-[200px]"
                    />
                  ))}
                </HorizontalRail>
              </section>
            )}

            {/* Footer spacing so the last rail clears the tab bar. */}
            <div className="h-2" aria-hidden />
            {isRefreshing && (
              <p role="status" className="type-caption text-center text-text-secondary">
                Refreshing…
              </p>
            )}
          </div>
        )}
      </div>

      <FulfillmentSheet
        open={fulfillmentOpen}
        onOpenChange={(o) => {
          // Don't allow dismissing without a choice — the user must
          // pick a method before browsing.
          if (!o && !fulfillment) return;
          setFulfillmentOpen(o);
        }}
        store={store}
        value={fulfillment}
        onConfirm={(f) => {
          setFulfillment(f);
          setFulfillmentOpen(false);
        }}
      />
    </AppShell>
  );
}
