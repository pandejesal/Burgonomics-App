import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useEffect, useRef } from "react";
import { LayoutGrid, List as ListIcon, Search } from "lucide-react";
import { toast } from "sonner";
import { HapticService } from "@/core/services/haptics";
import { toUserMessage } from "@/core/errors/userMessages";

import { AppShell } from "@/shared/layouts/AppShell";
import { Text } from "@/shared/components/common/Text";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { FailureState } from "@/shared/components/feedback/FailureState";
import { PetpoojaSyncPlaceholder } from "@/shared/components/feedback/PetpoojaSyncPlaceholder";

import { useStoreSelection } from "@/features/stores/state/storeStore";
import { cartRepository, FloatingCartBar } from "@/features/cart";
import { useMenuStore } from "@/features/menu/state/menuStore";
import { CategoryNavRail } from "@/features/menu/components/CategoryNavRail";
import { attachCategorySwipe } from "@/features/menu/utils/categorySwipe";
import type { MenuCategoryModel } from "@/features/menu/models";
import { MenuProductCard } from "@/features/menu/components/MenuProductCard";
import { MenuSkeleton } from "@/features/menu/components/MenuSkeleton";
import { ProductCustomizerModal } from "@/features/menu/components/ProductCustomizerModal";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { KitchenClosedBanner } from "@/shared/components/feedback/KitchenClosedBanner";
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
    if (resolved && useMenuStore.getState().activeCategoryId !== resolved) {
      setActiveCategory(resolved);
    }
  }, [searchParams.category, categories, setActiveCategory]);

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

  /**
   * Horizontal swipe on the product list switches category.
   *
   * MT-28: the old nested pager (a snap-x `scrollerRef` panel row with its own
   * `overflow-y-auto` sections and a 550ms `isProgrammaticScroll` lock) made
   * the two axes fight each other, dropping touch events and freezing both
   * directions. Products render in natural page flow, with native vertical
   * momentum and a direction-locked horizontal gesture listener.
   *
   * The native listeners are bound once per DOM node, not per render:
   * - The node is held in state through a stable callback ref, so the binding
   *   attaches whenever the list mounts late (store hydration, cached menu
   *   rendering after a failed refresh) and detaches when it unmounts. A plain
   *   `ref` read inside an effect never re-ran for those mounts, leaving the
   *   list without a gesture listener.
   * - Live POS snapshots replace `categories` with a new array on every sync
   *   (R23 dropped `status` but left `categories` in the deps), which re-bound
   *   the listeners mid-gesture and threw away the in-flight touch start.
   * - `activeCategoryId` is read from the store at gesture time, so a pill tap
   *   is visible to the very next swipe instead of the category captured when
   *   the listener happened to bind.
   */
  const [swipeElement, setSwipeElement] = React.useState<HTMLDivElement | null>(null);
  const bindProductList = React.useCallback((el: HTMLDivElement | null) => setSwipeElement(el), []);

  const selectCategoryRef = React.useRef(handleCategorySelect);
  React.useEffect(() => {
    selectCategoryRef.current = handleCategorySelect;
  }, [handleCategorySelect]);

  useEffect(() => {
    if (!swipeElement) return;
    return attachCategorySwipe(swipeElement, (direction) => {
      const live = useMenuStore.getState();
      const idx = live.categories.findIndex((c) => c.id === live.activeCategoryId);
      if (idx < 0) return false;
      const target = live.categories[idx + direction];
      if (!target) return false;
      selectCategoryRef.current(target.id);
      return true;
    });
  }, [swipeElement]);

  // A category can become active without ever having a bucket (deep link,
  // live category subscription, store switch). The list sentinel below only
  // renders once `buckets[activeCategoryId]` exists, so without priming the
  // panel stayed blank — the tap looked dead.
  useEffect(() => {
    if (!activeCategoryId) return;
    if (!buckets[activeCategoryId]) void loadMore(activeCategoryId);
  }, [activeCategoryId, buckets, loadMore]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // `buckets` is a dependency so the observer re-attaches when the sentinel
  // first mounts (the bucket arrives asynchronously) — without it the sentinel
  // could render with no observer and pagination would stall.
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
  }, [activeCategoryId, loadMore, buckets]);

  const handleAdd = React.useCallback(
    async (p: Product) => {
      if (p.customizable) {
        setCustomizingProduct(p);
        return;
      }
      if (!store) return;
      const res = await cartRepository.addItem({
        storeId: store.id,
        productId: p.id,
        name: p.name,
        imageUrl: p.imageUrl,
        fallbackImageUrl: p.fallbackImageUrl,
        veg: p.veg ?? true,
        unitPrice: p.price,
        quantity: 1,
      });
      if (!res.success) {
        toast.error("Couldn't add to cart", {
          description: toUserMessage(res),
        });
        return;
      }

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

  const bucket = activeCategoryId ? buckets[activeCategoryId] : undefined;
  const activeCategory = categories.find((c) => c.id === activeCategoryId);
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
      <div className="mx-auto max-w-[720px] pb-36">
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

        {/* Kitchen closed (11:00–23:00 IST): menu browsing stays open — the
            cart/checkout gates do the ordering. Renders nothing while open. */}
        <KitchenClosedBanner className="mx-4 mt-3" />

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
            {/* Sticky Category Nav Rail + View Toggle — pins below the top bar while the page scrolls */}
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

            {/* Active category products — natural vertical page flow.
                Vertical scrolling is native momentum scroll; a horizontal
                 swipe on this container switches category. */}
            <div
              className="px-4 py-3 touch-pan-y"
              ref={bindProductList}
            >
              <h2 className="sr-only">{activeCategory?.name ?? "Menu items"}</h2>
              {bucket?.error && !bucket.items.length ? (
                <FailureState
                  title="We couldn't load this category"
                  message={bucket.error}
                  onRetry={() => {
                    if (activeCategoryId) void loadMore(activeCategoryId);
                  }}
                />
              ) : bucket && bucket.items.length > 0 ? (
                <>
                  <div className={cn(viewMode === "grid" ? "grid grid-cols-2 gap-3.5" : "space-y-3")}>
                    {bucket.items.map((p) => (
                      <MenuProductCard
                        key={p.id}
                        product={p}
                        layout={viewMode === "grid" ? "grid" : "row"}
                        onAdd={handleAdd}
                      />
                    ))}
                  </div>
                  {/* Pagination sentinel — observing this loads the next page */}
                  {bucket.hasMore ? (
                    <div ref={sentinelRef} className="py-6 text-center">
                      <span className="type-caption text-text-secondary">
                        {bucket.loading ? "Loading more items…" : "Scroll for more"}
                      </span>
                    </div>
                  ) : (
                    <p className="py-6 text-center type-caption text-text-secondary">
                      You've reached the end of this category.
                    </p>
                  )}
                </>
              ) : bucket && !bucket.loading ? (
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
                <MenuSkeleton rows={5} />
              )}
            </div>
            <p className="px-4 py-1 text-center text-[10px] text-text-secondary">Swipe left/right to switch category • Tap pills above to jump</p>
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
