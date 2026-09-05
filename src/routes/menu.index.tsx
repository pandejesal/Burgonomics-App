import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useEffect, useRef } from "react";
import { LayoutGrid, List as ListIcon, Search } from "lucide-react";
import { toast } from "sonner";
import { HapticService } from "@/core/services/haptics";

import { AppShell } from "@/shared/layouts/AppShell";
import { Text } from "@/shared/components/common/Text";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { FailureState } from "@/shared/components/feedback/FailureState";
import { PetpoojaSyncPlaceholder } from "@/shared/components/feedback/PetpoojaSyncPlaceholder";

import { useStoreSelection } from "@/features/stores/state/storeStore";
import { cartRepository, FloatingCartBar } from "@/features/cart";
import { useMenuStore } from "@/features/menu/state/menuStore";
import { useDemoStore } from "@/features/demo/state/demoStore";
import { CategoryNavRail } from "@/features/menu/components/CategoryNavRail";
import { MenuProductCard } from "@/features/menu/components/MenuProductCard";
import { MenuSkeleton } from "@/features/menu/components/MenuSkeleton";
import { ProductCustomizerModal } from "@/features/menu/components/ProductCustomizerModal";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { useAppConfig } from "@/core/state/appConfigStore";
import { useDirectionalScroll } from "@/shared/hooks/useDirectionalScroll";
import type { Product } from "@/features/menu/models";
import { cn } from "@/lib/utils";

interface MenuSearchSchema {
  category?: string;
  view?: "list" | "grid";
}

/**
 * SCR-006 Menu. Fully data-driven — categories, products, badges,
 * prices, availability all come from the repository with real-time Petpooja 86ing.
 * Supports TanStack Router search param deep linking (/menu?category=cat_burgers).
 */
export const Route = createFileRoute("/menu/")({
  validateSearch: (search: Record<string, unknown>): MenuSearchSchema => ({
    category:
      typeof search.category === "string" && search.category.trim()
        ? search.category.trim()
        : undefined,
    view: search.view === "list" || search.view === "grid" ? search.view : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Menu — Burgonomics (100% Pure Vegetarian)" },
      {
        name: "description",
        content:
          "Explore the Burgonomics menu — 100% Pure Vegetarian, served fresh from your selected store.",
      },
    ],
  }),
  component: MenuPage,
});

function MenuPage() {
  const navigate = useNavigate();
  const searchParams = Route.useSearch();
  useOnlineStatus();
  const online = useAppConfig((s) => s.isOnline);
  const store = useStoreSelection((s) => s.activeStore);
  const isHydrated = useStoreSelection((s) => s.isHydrated);
  const simulationMode = useDemoStore((s) => s.simulationMode);

  const status = useMenuStore((s) => s.status);
  const error = useMenuStore((s) => s.error);
  const categories = useMenuStore((s) => s.categories);
  const activeCategoryId = useMenuStore((s) => s.activeCategoryId);
  const buckets = useMenuStore((s) => s.buckets);
  const viewMode = useMenuStore((s) => s.viewMode);
  const load = useMenuStore((s) => s.load);
  const loadMore = useMenuStore((s) => s.loadMore);
  const setActiveCategory = useMenuStore((s) => s.setActiveCategory);
  const setViewMode = useMenuStore((s) => s.setViewMode);
  const subscribeToLiveMenu = useMenuStore((s) => s.subscribeToLiveMenu);

  // Selected product for inline customization modal
  const [customizingProduct, setCustomizingProduct] = React.useState<Product | null>(null);

  // Load menu data and subscribe to real-time Petpooja 86ing sync
  useEffect(() => {
    if (!isHydrated) return;
    if (!store) {
      void navigate({ to: "/stores", replace: true });
      return;
    }
    void load(store.id);
    const unsub = subscribeToLiveMenu(store.id);
    return () => unsub();
  }, [isHydrated, store, load, subscribeToLiveMenu, navigate]);

  // Sync category from URL search params into store if provided
  useEffect(() => {
    if (searchParams.category && categories.some((c) => c.id === searchParams.category)) {
      if (activeCategoryId !== searchParams.category) {
        setActiveCategory(searchParams.category);
      }
    }
  }, [searchParams.category, categories, activeCategoryId, setActiveCategory]);

  // Sync viewMode from URL search params if provided
  useEffect(() => {
    if (searchParams.view && (searchParams.view === "list" || searchParams.view === "grid")) {
      if (viewMode !== searchParams.view) {
        setViewMode(searchParams.view);
      }
    }
  }, [searchParams.view, viewMode, setViewMode]);

  const handleCategorySelect = React.useCallback(
    (categoryId: string) => {
      setActiveCategory(categoryId);
      void navigate({
        to: "/menu",
        search: (prev: MenuSearchSchema) => ({ ...prev, category: categoryId }),
        replace: true,
      });
    },
    [setActiveCategory, navigate],
  );

  const handleViewModeToggle = React.useCallback(
    (mode: "list" | "grid") => {
      setViewMode(mode);
      void navigate({
        to: "/menu",
        search: (prev: MenuSearchSchema) => ({ ...prev, view: mode }),
        replace: true,
      });
    },
    [setViewMode, navigate],
  );

  const scrollerRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);
  useDirectionalScroll(scrollerRef as React.RefObject<HTMLElement | null>);

  // Keep CategoryNavRail and horizontal pager in sync — tap rail scrolls pager, swipe pager updates rail.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || categories.length === 0) return;
    let raf: number | null = null;
    const onScroll = () => {
      if (isProgrammaticScroll.current) return;
      if (raf !== null) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const idx = Math.round(el.scrollLeft / el.clientWidth);
        const cat = categories[idx];
        if (cat && cat.id !== activeCategoryId) {
          setActiveCategory(cat.id);
          void navigate({
            to: "/menu",
            search: (prev: MenuSearchSchema) => ({ ...prev, category: cat.id }),
            replace: true,
          });
        }
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [categories, activeCategoryId, setActiveCategory, navigate]);

  useEffect(() => {
    if (!activeCategoryId || !scrollerRef.current) return;
    const idx = categories.findIndex((c) => c.id === activeCategoryId);
    if (idx < 0) return;
    const el = scrollerRef.current;
    const targetLeft = idx * el.clientWidth;
    if (Math.abs(el.scrollLeft - targetLeft) < 4) return;
    isProgrammaticScroll.current = true;
    el.scrollTo({ left: targetLeft, behavior: "smooth" });
    const t = window.setTimeout(() => {
      isProgrammaticScroll.current = false;
    }, 550);
    return () => window.clearTimeout(t);
  }, [activeCategoryId, categories]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !activeCategoryId) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void loadMore(activeCategoryId);
        }
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [activeCategoryId, loadMore]);

  const handleAdd = React.useCallback(
    (p: Product) => {
      if (p.customizable) {
        setCustomizingProduct(p);
        return;
      }
      if (!store) return;
      void cartRepository.addItem({
        storeId: store.id,
        productId: p.id,
        name: p.name,
        imageUrl: p.imageUrl,
        fallbackImageUrl: p.fallbackImageUrl,
        veg: p.veg ?? true,
        unitPrice: p.price,
        quantity: 1,
      });

      void HapticService.impact("medium");

      toast.success(`✓ ${p.name} added`, {
        action: {
          label: "View Cart",
          onClick: () => {
            void navigate({ to: "/cart" });
          },
        },
        duration: 3000,
      });
    },
    [store, navigate],
  );

  if (!store) return null;

  const activeIdx = Math.max(
    0,
    categories.findIndex((c) => c.id === activeCategoryId)
  );
  const bucket = activeCategoryId ? buckets[activeCategoryId] : undefined;
  const initialLoading = status === "loading" && categories.length === 0;

  return (
    <AppShell
      title="Menu"
      showTabs
      showTopBar
      rightSlot={
        <Link
          to="/search"
          aria-label="Search the menu"
          className="grid h-11 w-11 place-items-center rounded-full hover:bg-bg-secondary cursor-pointer"
        >
          <Search className="h-5 w-5" aria-hidden />
        </Link>
      }
    >
      <div className="mx-auto max-w-[720px] pb-32">
        {!online && (
          <div className="px-4 pt-3">
            <div
              role="status"
              className="rounded-[var(--radius-medium)] border border-warning/40 bg-warning/10 p-3 type-body-medium font-medium text-amber-900 dark:text-amber-200"
            >
              You are offline. Menu may be out of date.
            </div>
          </div>
        )}

        {initialLoading ? (
          <MenuSkeleton />
        ) : status === "error" && !categories.length ? (
          <FailureState
            title="We couldn't load the menu"
            message={error ?? "Please try again in a moment."}
            onRetry={() => load(store.id, { refresh: true })}
          />
        ) : status === "empty" || categories.length === 0 ? (
          !simulationMode ? (
            <PetpoojaSyncPlaceholder storeId={store.id} />
          ) : (
            <EmptyState
              title="No menu available"
              description={
                store.isOpen === false
                  ? "This store is currently closed. Try again during opening hours."
                  : "The menu for this store hasn't been published yet."
              }
              actionLabel="Change store"
              onAction={() => navigate({ to: "/stores" })}
            />
          )
        ) : (
          <>
            {/* Sticky Category Nav Rail + View Toggle */}
            <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-20 bg-surface/95 backdrop-blur-md shadow-sm border-b border-divider">
              <CategoryNavRail
                categories={categories}
                activeCategoryId={activeCategoryId}
                onSelectCategory={handleCategorySelect}
              />
              <div className="flex items-center justify-between px-4 py-2 border-t border-divider/40">
                <Text variant="bodyMedium" tone="secondary" className="font-medium text-xs">
                  {bucket?.total ? `${bucket.total} pure veg items` : `${categories.length} categories • swipe to browse`}
                </Text>
                <div className="flex items-center gap-1" role="group" aria-label="View mode">
                  <button
                    type="button"
                    aria-label="List view"
                    aria-pressed={viewMode === "list"}
                    onClick={() => handleViewModeToggle("list")}
                    className={cn(
                      "grid h-9 w-9 place-items-center rounded-xl transition-colors cursor-pointer",
                      viewMode === "list"
                        ? "bg-[#0E4825] text-white font-bold"
                        : "text-text-secondary hover:text-text-primary",
                    )}
                  >
                    <ListIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Grid view"
                    aria-pressed={viewMode === "grid"}
                    onClick={() => handleViewModeToggle("grid")}
                    className={cn(
                      "grid h-9 w-9 place-items-center rounded-xl transition-colors cursor-pointer",
                      viewMode === "grid"
                        ? "bg-[#0E4825] text-white font-bold"
                        : "text-text-secondary hover:text-text-primary",
                    )}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Horizontal swipe pager — each category is a full-width snap panel */}
            <div
              ref={scrollerRef}
              className="flex w-full overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar overscroll-x-contain touch-pan-y"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {categories.map((cat, idx) => {
                const b = buckets[cat.id];
                // Windowed pager: only the active panel + immediate neighbours
                // mount cards. The old code mounted EVERY category's cards
                // (200 cards × ~4 motion nodes ≈ 800 animated nodes) — scroll
                // jank on low-end WebViews. Off-window panels keep an empty
                // full-width section so snap math (idx × width) still holds.
                if (Math.abs(idx - activeIdx) > 1) {
                  return (
                    <section
                      key={cat.id}
                      aria-hidden
                      className="w-full shrink-0 snap-start snap-always"
                    />
                  );
                }
                return (
                  <section
                    key={cat.id}
                    aria-label={cat.name}
                    className="w-full shrink-0 snap-start snap-always px-4 py-4"
                  >
                    <h2 className="sr-only">{cat.name}</h2>
                    {b?.loading && !b.items.length ? (
                      <MenuSkeleton rows={5} />
                    ) : b?.error && !b.items.length ? (
                      <FailureState
                        title="We couldn't load this category"
                        message={b.error}
                        onRetry={() => loadMore(cat.id)}
                      />
                    ) : b && b.items.length === 0 ? (
                      <EmptyState
                        title="Nothing here yet"
                        description="This category has no available items right now."
                      />
                    ) : (
                      <div className={cn(viewMode === "grid" ? "grid grid-cols-2 gap-3.5" : "space-y-3")}>
                        {b?.items.map((p) => (
                          <MenuProductCard
                            key={p.id}
                            product={p}
                            layout={viewMode === "grid" ? "grid" : "row"}
                            onAdd={handleAdd}
                          />
                        ))}
                      </div>
                    )}
                    {cat.id === activeCategoryId && b?.hasMore && (
                      <div ref={sentinelRef} className="py-6 text-center">
                        <span className="type-caption text-text-secondary">
                          {b.loading ? "Loading more items…" : "Scroll for more"}
                        </span>
                      </div>
                    )}
                    {cat.id === activeCategoryId && b && !b.hasMore && b.items.length > 0 && (
                      <p className="py-6 text-center type-caption text-text-secondary">
                        You've reached the end of this category.
                      </p>
                    )}
                    {/* Preload next category hint */}
                    {cat.id !== activeCategoryId && b && b.items.length === 0 && !b.loading && (
                      <p className="py-4 text-center type-caption text-text-secondary">Swipe to load {cat.name}</p>
                    )}
                  </section>
                );
              })}
            </div>
            <p className="px-4 pb-2 text-center text-[10px] text-text-secondary">Swipe left/right to switch category • Tap pills above to jump</p>
          </>
        )}
      </div>

      {/* Customizable Product Modal */}
      {customizingProduct && (
        <ProductCustomizerModal
          product={customizingProduct}
          isOpen={Boolean(customizingProduct)}
          onClose={() => setCustomizingProduct(null)}
        />
      )}

      {/* Persistent Floating Mini Cart Bar */}
      <FloatingCartBar />
    </AppShell>
  );
}

export default MenuPage;
