import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/shared/layouts/AppShell";
import { FailureState } from "@/shared/components/feedback/FailureState";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { PetpoojaSyncPlaceholder } from "@/shared/components/feedback/PetpoojaSyncPlaceholder";

import { useStoreSelection } from "@/features/stores/state/storeStore";
import { FulfillmentSheet } from "@/features/stores/components/FulfillmentSheet";
import { useAuthStore, selectIsAuthenticated } from "@/features/auth/state/authStore";
import { useDemoStore } from "@/features/demo/state/demoStore";

import { useHomeStore } from "@/features/home";
import { CategoryPills } from "@/features/menu/components/CategoryPills";
import { LaPinozHeader } from "@/features/home/components/LaPinozHeader";
import { BannerCarousel } from "@/features/home/components/BannerCarousel";
import { CategoryGrid } from "@/features/home/components/CategoryGrid";
import { HorizontalRail } from "@/features/home/components/HorizontalRail";
import { SectionHeader } from "@/features/home/components/SectionHeader";
import { BestSellerCard } from "@/features/home/components/BestSellerCard";
import { ComboCard } from "@/features/home/components/ComboCard";
import { QuickReorderRail } from "@/features/home/components/QuickReorderRail";
import { HomeSkeleton } from "@/features/home/components/HomeSkeleton";
import { FloatingCartBar } from "@/features/cart/components/FloatingCartBar";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { useAppConfig } from "@/core/state/appConfigStore";
import type { Product } from "@/features/menu/models";

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

  // Load / reload on store change.
  useEffect(() => {
    if (store) {
      void load(store.id, user?.id);
    }
  }, [store, user?.id, load]);

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
      showTopBar={false}
    >
      <div className="mx-auto max-w-[520px] pb-10">
        {/* Full-bleed Header — single fulfillment switch inside (Delivery / Takeaway / Dine-In) */}
        <LaPinozHeader onSearchClick={() => void navigate({ to: "/search" })} />

        {/* Category shortcut pills — POS category list */}
        <div className="px-4 mt-3">
          <CategoryPills
            selectedCategory="all"
            onSelectCategory={(catId) => {
              if (catId === "all") void navigate({ to: "/menu" });
              else void navigate({ to: "/menu", search: { category: catId } });
            }}
            className="mt-3"
          />
        </div>

        {/* Offline strip */}
        {!online && (
          <div className="mt-4 px-4">
            <div
              role="status"
              className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs font-medium text-amber-900 dark:text-amber-200"
            >
              You are offline. Showing the latest cached content.
            </div>
          </div>
        )}

        {/* Body Content */}
        {isLoading ? (
          <div className="mt-4">
            <HomeSkeleton />
          </div>
        ) : status === "error" && !bundle ? (
          <div className="mt-6 px-4">
            <FailureState
              title="We couldn't load Home"
              message={error ?? "Please try again in a moment."}
              onRetry={handleRefresh}
            />
          </div>
        ) : status === "empty" || !bundle ? (
          !simulationMode ? (
            <div className="mt-4 px-4">
              <PetpoojaSyncPlaceholder storeId={store.id} />
            </div>
          ) : (
            <div className="mt-6 px-4">
              <EmptyState
                title="Nothing to show yet"
                description="Menu and offers for this store will appear here soon."
                actionLabel="Browse menu"
                onAction={() => navigate({ to: "/menu" })}
              />
            </div>
          )
        ) : (
          <div className="mt-4 space-y-6">
            {/* POS-driven Promo Banner Carousel — single source of truth */}
            {bundle.banners.length > 0 && <BannerCarousel banners={bundle.banners} />}

            {/* 3-Column Explore Menu Grid */}
            {bundle.categories.length > 0 && (
              <section aria-labelledby="cats-heading">
                <SectionHeader
                  title="Explore Menu"
                  subtitle="100% Pure Veg QSR favorites"
                  actionLabel="View all"
                  actionTo="/menu"
                />
                <CategoryGrid categories={bundle.categories} />
              </section>
            )}

            {/* Quick Reorder Rail (for authenticated users) */}
            {isAuthenticated && bundle.quickReorder.length > 0 && (
              <section aria-labelledby="reorder-heading">
                <SectionHeader
                  title="Reorder in 1-Tap"
                  subtitle="From your previous favorites"
                  actionLabel="View all orders"
                  actionTo="/orders"
                />
                <QuickReorderRail items={bundle.quickReorder} />
              </section>
            )}

            {/* Bestsellers Snap-Scroll Rail with BestSellerCard */}
            {bundle.bestSellers.length > 0 && (
              <section aria-labelledby="best-heading">
                <SectionHeader
                  title="Bestsellers"
                  subtitle="Top customer favorites"
                  actionLabel="Full menu"
                  actionTo="/menu"
                />
                <HorizontalRail ariaLabel="Best selling items">
                  {bundle.bestSellers.map((it) => (
                    <BestSellerCard
                      key={it.id}
                      product={it as unknown as Product}
                      onCardClick={() => handleCardClick(it.id)}
                    />
                  ))}
                </HorizontalRail>
              </section>
            )}

            {/* Curated Value Combos Rail — POS cat_combos only */}
            {bundle.popularCombos.length > 0 && (
              <section aria-labelledby="combos-heading">
                <SectionHeader
                  title="Value Combos"
                  subtitle="Pre-bundled savings straight from POS"
                  actionLabel="See all combos"
                  actionTo="/menu"
                />
                <HorizontalRail ariaLabel="Popular combos">
                  {bundle.popularCombos.map((c) => (
                    <ComboCard key={c.id} combo={c} />
                  ))}
                </HorizontalRail>
              </section>
            )}

            {isRefreshing && (
              <p role="status" className="type-caption text-center text-text-secondary pt-2">
                Refreshing menu…
              </p>
            )}
          </div>
        )}
      </div>

      {/* Floating Mini Cart Bar */}
      <FloatingCartBar />

      <FulfillmentSheet
        open={fulfillmentOpen}
        onOpenChange={(o) => {
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
