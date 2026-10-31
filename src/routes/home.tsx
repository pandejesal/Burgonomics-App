import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useCallback, useEffect } from "react";

import { AppShell } from "@/shared/layouts/AppShell";
import { FailureState } from "@/shared/components/feedback/FailureState";
import { PetpoojaSyncPlaceholder } from "@/shared/components/feedback/PetpoojaSyncPlaceholder";

import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useAuthStore } from "@/features/auth/state/authStore";

import { useHomeStore } from "@/features/home";
import { BrandHeader } from "@/features/home/components/BrandHeader";
import { BannerCarousel } from "@/features/home/components/BannerCarousel";
import { CategoryGrid } from "@/features/home/components/CategoryGrid";
import { HorizontalRail } from "@/features/home/components/HorizontalRail";
import { SectionHeader } from "@/features/home/components/SectionHeader";
import { BestSellerCard } from "@/features/home/components/BestSellerCard";
import { ComboCard } from "@/features/home/components/ComboCard";
import { HomeSkeleton } from "@/features/home/components/HomeSkeleton";
import { HomeAnnouncements } from "@/features/home/components/HomeAnnouncements";
import { FavoritesRail } from "@/features/home/components/FavoritesRail";
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

  const user = useAuthStore((s) => s.user);

  const status = useHomeStore((s) => s.status);
  const bundle = useHomeStore((s) => s.bundle);
  const error = useHomeStore((s) => s.error);
  const load = useHomeStore((s) => s.load);
  const loadedStoreId = useHomeStore((s) => s.lastLoadedStoreId);
  const loadedUserId = useHomeStore((s) => s.lastLoadedUserId);

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

  // Wait for the persisted store before deciding: with isHydrated starting
  // false, the /stores bounce below only fires for a genuine no-store state.
  if (!isHydrated) return null;
  if (!store) return null;

  const scopedUserId = user?.id ?? null;
  const hasScopedResult =
    loadedStoreId === store.id && loadedUserId === scopedUserId && bundle !== null;
  const isLoading = status === "loading" || (status !== "error" && !hasScopedResult);
  const isRefreshing = status === "refreshing";

  const handleRefresh = async () => {
    if (!store) return;
    await load(store.id, user?.id, { refresh: true });
  };

  return (
    <AppShell title="BURGONOMICS" showTabs showTopBar={false}>
      <div className="mx-auto max-w-[520px] pb-16">
        {/* One page-level heading for assistive tech; the visual wordmark is
            rendered by BrandHeader so it stays a single tappable home control. */}
        <h1 className="sr-only">Burgonomics Home</h1>
        {/* Full-bleed Header — single fulfillment switch inside (Delivery / Takeaway / Dine-In) */}
        <BrandHeader />

        {/* Category entrances live in the two-column grid below; the pill strip
            duplicated them on Home and is intentionally removed. */}

        {/* Offline strip */}
        {!online && (
          <div className="mt-4 px-4">
            <div
              role="status"
              className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm font-medium text-warning"
            >
              You are offline. Showing the latest cached content.
            </div>
          </div>
        )}

        {/* Body Content */}
        {status === "error" ? (
          <div className="mt-6 px-4">
            <FailureState
              title="We couldn't load Home"
              message={error ?? "Please try again in a moment."}
              onRetry={handleRefresh}
            />
          </div>
        ) : isLoading ? (
          <div className="mt-4">
            <HomeSkeleton />
          </div>
        ) : status === "empty" || !hasScopedResult || !bundle ? (
          <div className="mt-4 px-4">
            <PetpoojaSyncPlaceholder storeId={store.id} onRetry={handleRefresh} />
          </div>
        ) : (
          <div className="mt-3 space-y-6">
            {/* POS-driven Promo Banner Carousel — single source of truth */}
            {bundle.banners.length > 0 && (
              <BannerCarousel key={store.id} banners={bundle.banners} />
            )}

            {/* Menu heading and Search share one row below the promo; the four
                photo shortcuts follow. Order matches the observed reference. */}
            {bundle.categories.length > 0 && (
              <section aria-labelledby="cats-heading">
                <div className="flex items-center justify-between gap-3 px-4">
                  <h2
                    id="cats-heading"
                    className="type-brand-heading min-w-0 break-words text-2xl leading-tight text-text-primary"
                  >
                    On the menu
                  </h2>
                  <button
                    type="button"
                    onClick={() => void navigate({ to: "/search" })}
                    aria-label="Search the menu"
                    className="flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-bg-secondary px-4 py-2 text-sm font-medium leading-snug text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Search</span>
                  </button>
                </div>
                <CategoryGrid categories={bundle.categories} className="mt-4 pb-4" />
              </section>
            )}

            {/* On Home the saved basket follows the shortcuts instead of
                covering them; Menu/Search retain their floating cart bar. */}
            <FloatingCartBar compact inline />

            <FavoritesRail />

            {/* Bestsellers Snap-Scroll Rail with BestSellerCard */}
            {bundle.bestSellers.length > 0 && (
              <section aria-labelledby="best-heading" className="pt-4">
                <SectionHeader
                  id="best-heading"
                  title="Best sellers"
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

            {/* Actual meal/combo products from this outlet's normalized catalog. */}
            {bundle.popularCombos.length > 0 && (
              <section aria-labelledby="combos-heading" className="pt-4">
                <SectionHeader
                  id="combos-heading"
                  title="Make it a meal"
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

            <HomeAnnouncements />
          </div>
        )}
      </div>
    </AppShell>
  );
}
