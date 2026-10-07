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
import { CategoryNavRail } from "@/features/menu/components/CategoryNavRail";
import type { MenuCategoryModel } from "@/features/menu/models";
import { MenuProductCard } from "@/features/menu/components/MenuProductCard";
import { MenuSkeleton } from "@/features/menu/components/MenuSkeleton";
import { ProductCustomizerModal } from "@/features/menu/components/ProductCustomizerModal";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { useAppConfig } from "@/core/state/appConfigStore";
// import { useDirectionalScroll } from "@/shared/hooks/useDirectionalScroll"; // REMOVED 2026-10-06: blocked native swipe
import type { Product } from "@/features/menu/models";
import { cn } from "@/lib/utils";

interface MenuSearchSchema {
  category?: string;
  view?: "list" | "grid";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Resolve `?category=` against the categories actually loaded for this store.
 *
 * Home's category pills and the Explore grid send shortcut ids (`beverages`,
 * `sides`, `cat_burgers`, …) that may not exist in the menu store's id space.
 * The old exact-id match dropped those silently, so the menu opened on
 * whatever category happened to be first and the tap looked dead. Matching
 * by id still wins; name/slug matching is the fallback.
 */
function resolveCategoryId(
  param: string | undefined,
  categories: { id: string; name: string }[],
): string | undefined {
  if (!param) return undefined;
  const raw = param.trim().toLowerCase();
  if (!raw) return undefined;

  const byId = categories.find((c) => c.id.toLowerCase() === raw);
  if (byId) return byId.id;

  const target = slugify(raw);
  if (!target) return undefined;

  const byName = categories.find((c) => slugify(c.name) === target);
  if (byName) return byName.id;

  const targetTokens = new Set(target.split(" "));
  const byToken = categories.find((c) =>
    slugify(c.name)
      .split(" ")
      .some((token) => targetTokens.has(token)),
  );
  return byToken?.id;
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

  const status = useMenuStore((s) => s.status);
  const error = useMenuStore((s) => s.error);
  const stale = useMenuStore((s) => s.stale);
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

  // Sync category from URL search params into store if provided.
  // `resolveCategoryId` (id → name → slug token) keeps shortcut ids coming
  // from Home pills landing on a real category instead of being discarded.
  useEffect(() => {
    const resolved = resolveCategoryId(searchParams.category, categories);
    if (resolved && activeCategoryId !== resolved) {
      setActiveCategory(resolved);
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
      isViewModeChanging.current = true;
      setViewMode(mode);
      void navigate({
        to: "/menu",
        search: (prev: MenuSearchSchema) => ({ ...prev, view: mode }),
        replace: true,
      });
      // Reset flag after navigation settles
      setTimeout(() => { isViewModeChanging.current = false; }, 100);
    },
    [setViewMode, navigate],
  );

  const scrollerRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);
  const isViewModeChanging = useRef(false);
  /**
   * Marks the active-category change that came FROM the pager itself.
   *
   * The old code re-scrolled on every `activeCategoryId` change, including the
   * ones its own scroll listener produced. Mid-swipe that cancelled the
   * in-flight momentum + `snap-mandatory` settling and re-targeted the pager at
   * an intermediate panel, stranding the view between categories (blank
   * windowed panels either side) with no way to recover — the exact
   * "frozen between A/B/C" report.
   */
  const scrollDrivenFor = useRef<string | null>(null);
  // Native scroll + snap works better than useDirectionalScroll or custom pointer drag
  // for full-width snap pagers on Android WebView.

  // Keep CategoryNavRail and horizontal pager in sync — tap rail scrolls pager, swipe pager updates rail.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || categories.length === 0) return;
    let raf: number | null = null;
    const onScroll = () => {
      if (isProgrammaticScroll.current || isViewModeChanging.current) return;
      if (raf !== null) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const idx = Math.round(el.scrollLeft / el.clientWidth);
        const cat = categories[idx];
        if (cat && cat.id !== activeCategoryId) {
          scrollDrivenFor.current = cat.id;
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

  // Rail / pill / URL driven selection → bring the target panel into view.
  // Changes flagged by the scroll listener above skip this: the pager is
  // already there (or still settling), and forcing a scroll would fight it.
  useEffect(() => {
    if (scrollDrivenFor.current === activeCategoryId) {
      scrollDrivenFor.current = null;
      return;
    }
    // Drop a marker left behind by a change that never reached this effect.
    scrollDrivenFor.current = null;

    const el = scrollerRef.current;
    if (!el || !activeCategoryId || categories.length === 0) return;
    const idx = categories.findIndex((c) => c.id === activeCategoryId);
    if (idx < 0) return;
    const targetLeft = idx * el.clientWidth;
    if (Math.abs(el.scrollLeft - targetLeft) < 4) return;

    const currentIndex = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    isProgrammaticScroll.current = true;
    // Use instant for ALL programmatic scrolls (including adjacent) to avoid:
    // - race between scroll listener reverting activeCategoryId mid-smooth-animation
    // - useDirectionalScroll momentum cancelling smooth scroll (both write scrollLeft)
    // - 550ms timeout expiring before animation completes on slow WebView
    // The "smooth" path was intended for UX but caused the exact "adjacent tap ignored"
    // bug because the listener at L199-L212 reads scrollLeft mid-flight, rounds to
    // the origin panel, and reverts the tap.
    el.scrollTo({
      left: targetLeft,
      behavior: "instant",
    });

    // Release the guard only once the scroll has actually settled. The old
    // fixed 550ms guess could expire while momentum/snap was still running,
    // which let the listener above retarget the pager mid-flight again.
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      el.removeEventListener("scrollend", settle);
      isProgrammaticScroll.current = false;
    };
    el.addEventListener("scrollend", settle);
    const timer = window.setTimeout(settle, 550);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener("scrollend", settle);
      // Never leave the pager ignoring user scrolls (cleanup also runs on
      // unmount and before the next selection's scroll starts).
      isProgrammaticScroll.current = false;
    };
  }, [activeCategoryId, categories]);

  // A category can become active without ever having a bucket (deep link,
  // live category subscription, store switch). The list sentinel below only
  // renders once `buckets[activeCategoryId]` exists, so without priming the
  // panel stayed blank — the tap looked dead.
  useEffect(() => {
    if (!activeCategoryId) return;
    if (!buckets[activeCategoryId]) void loadMore(activeCategoryId);
  }, [activeCategoryId, buckets, loadMore]);

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

        {online && stale && categories.length > 0 && (
          <div className="px-4 pt-3">
            <div
              role="status"
              className="flex items-center justify-between gap-3 rounded-[var(--radius-medium)] border border-warning/40 bg-warning/10 p-3 type-body-medium font-medium text-amber-900 dark:text-amber-200"
            >
              <span>Live updates paused{error ? ` (${error})` : ""} — showing last saved menu.</span>
              <button
                type="button"
                onClick={() => store && void load(store.id, { refresh: true })}
                className="shrink-0 rounded-lg bg-warning/20 px-3 py-1.5 text-xs font-bold cursor-pointer"
              >
                Retry
              </button>
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
          <PetpoojaSyncPlaceholder
            storeId={store.id}
            onRetry={() => load(store.id, { refresh: true })}
          />
        ) : (
          <>
            {/* Sticky Category Nav Rail + View Toggle */}
            <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-20 bg-surface/95 backdrop-blur-md shadow-sm border-b border-divider">
              <CategoryNavRail
                categories={categories.map((cat) => ({
                  ...cat,
                  itemCount: buckets[cat.id]?.items.length ?? cat.itemCount ?? 0,
                }))}
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
              className="flex w-full overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar overscroll-x-contain overscroll-y-auto"
              style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y" }}
            >
              {categories.map((cat, idx) => {
                const b = buckets[cat.id];
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
                        actionLabel="Try another category"
                        onAction={() => {
                          const next = categories.find((c) => (buckets[c.id]?.items.length ?? 0) > 0);
                          if (next) handleCategorySelect(next.id);
                        }}
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
