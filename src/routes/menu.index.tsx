import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { LayoutGrid, List as ListIcon, Search } from "lucide-react";
import { toast } from "sonner";
import { HapticService } from "@/core/services/haptics";
import { toUserMessage } from "@/core/errors/userMessages";

import { AppShell } from "@/shared/layouts/AppShell";
import { Text } from "@/shared/components/common/Text";
import { FailureState } from "@/shared/components/feedback/FailureState";
import { PetpoojaSyncPlaceholder } from "@/shared/components/feedback/PetpoojaSyncPlaceholder";

import { useStoreSelection } from "@/features/stores/state/storeStore";
import { cartRepository, FloatingCartBar } from "@/features/cart";
import { useMenuStore } from "@/features/menu/state/menuStore";
import { menuRepository } from "@/features/menu/repositories/MenuRepository";
import { CategoryNavRail } from "@/features/menu/components/CategoryNavRail";
import { MenuCategorySection } from "@/features/menu/components/MenuCategorySection";
import { resolveCategoryParam } from "@/features/menu/utils/categoryResolve";
import { afterNextPaint } from "@/features/menu/utils/afterPaint";
import {
  pickActiveSection,
  stickyScrollMargin,
  type SectionViewportPosition,
} from "@/features/menu/utils/sectionSpy";
import type { MenuCategoryModel, Product, ProductDetails } from "@/features/menu/models";
import { MenuSkeleton } from "@/features/menu/components/MenuSkeleton";
import { ProductCustomizerModal } from "@/features/menu/components/ProductCustomizerModal";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { KitchenClosedBanner } from "@/shared/components/feedback/KitchenClosedBanner";
import { useAppConfig } from "@/core/state/appConfigStore";
import { cn } from "@/lib/utils";

interface MenuSearchSchema {
  category?: string;
  view?: "list" | "grid";
}

/** How long a programmatic jump owns the highlight before the spy takes over. */
const JUMP_GUARD_MS = 1500;

/**
 * SCR-006 Menu — ONE continuous page with every real category of the selected
 * store, in the store's own order.
 *
 * The rail is navigation, not tabs: category A's last row is followed by
 * category B's heading in the same vertical scroll, the active heading follows
 * the viewport, and a rail tap jumps to a section it first loads (target +
 * adjacent only, never every category in between).
 *
 * Reads stay on the existing store-scoped catalog substrate: `listProducts`
 * still scans the store's products and slices locally, there is no cursor or
 * network pagination behind a "page". The UI makes that honest by loading 20
 * items per section on demand with at most two reads in flight.
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
  const menuStoreId = useMenuStore((s) => s.storeId);
  const load = useMenuStore((s) => s.load);
  const loadMore = useMenuStore((s) => s.loadMore);
  const setActiveCategory = useMenuStore((s) => s.setActiveCategory);
  const setViewMode = useMenuStore((s) => s.setViewMode);
  const subscribeToLiveMenu = useMenuStore((s) => s.subscribeToLiveMenu);

  // Selected product for the inline customizer. Always a real ProductDetails
  // (customization groups included) — never a bare Product cast to details.
  const [customizingProduct, setCustomizingProduct] = React.useState<ProductDetails | null>(null);
  const [customizerStoreId, setCustomizerStoreId] = React.useState<string | null>(null);
  const [customizerLoadingId, setCustomizerLoadingId] = React.useState<string | null>(null);
  const [deepLinkNotice, setDeepLinkNotice] = React.useState<string | null>(null);

  const stickyRef = React.useRef<HTMLDivElement | null>(null);
  // 195 = 56px app bar + ~131px sticky rail + 8px gap, the launch chrome on a
  // phone. The rail re-measures itself on mount/resize; starting here means a
  // cold deep link cannot scroll a heading under chrome that has not been
  // measured yet.
  const [stickyOffset, setStickyOffset] = React.useState(195);

  const sectionRefs = React.useRef(new Map<string, HTMLElement>());
  /** Set while a rail/deep-link jump animates, so the scroll spy cannot fight it. */
  const jumpGuardRef = React.useRef<{ id: string; until: number } | null>(null);
  /** Last resolved URL category that was applied — prevents URL ↔ scroll loops. */
  const appliedParamRef = React.useRef<string | null>(null);
  const customizerRequestRef = React.useRef(0);
  const jumpRequestRef = React.useRef(0);
  const jumpCorrectTimerRef = React.useRef<number | null>(null);
  const currentStoreRef = React.useRef(store?.id);
  currentStoreRef.current = store?.id;

  React.useLayoutEffect(() => {
    customizerRequestRef.current += 1;
    jumpRequestRef.current += 1;
    jumpGuardRef.current = null;
    appliedParamRef.current = null;
    setCustomizingProduct(null);
    setCustomizerStoreId(null);
    if (jumpCorrectTimerRef.current !== null) {
      window.clearTimeout(jumpCorrectTimerRef.current);
      jumpCorrectTimerRef.current = null;
    }
    setCustomizerLoadingId(null);
    return () => {
      customizerRequestRef.current += 1;
      jumpRequestRef.current += 1;
    };
  }, [store?.id]);

  const registerSection = React.useCallback((categoryId: string, element: HTMLElement | null) => {
    if (element) sectionRefs.current.set(categoryId, element);
    else sectionRefs.current.delete(categoryId);
  }, []);

  // Load menu data and subscribe to real-time Petpooja 86ing sync.
  React.useEffect(() => {
    if (!isHydrated) return;
    if (!store) {
      void navigate({ to: "/stores", replace: true });
      return;
    }
    void load(store.id);
    const unsubscribe = subscribeToLiveMenu(store.id);
    return () => unsubscribe();
  }, [isHydrated, store, load, subscribeToLiveMenu, navigate]);

  const measureChromeMargin = React.useCallback((): number | null => {
    const rail = stickyRef.current;
    if (!rail) return null;
    const railHeight = rail.getBoundingClientRect().height;
    if (railHeight <= 0) return null;
    // The rail sticks below the app bar. `top` alone under-reports when the
    // status-bar safe-area inset is part of the WebView, so measure the header
    // that actually sits above it and add the rail's own height.
    const header = document.querySelector<HTMLElement>(".app-shell > header");
    const headerBottom = header?.getBoundingClientRect().bottom;
    const stuckTop =
      typeof headerBottom === "number" && headerBottom > 0
        ? headerBottom
        : Number.parseFloat(window.getComputedStyle(rail).top) || 0;
    return stickyScrollMargin(stuckTop + railHeight);
  }, []);

  // Measure the sticky chrome (app bar + rail + view toggle row) so a jump
  // lands the heading just below it at any zoom level.
  React.useLayoutEffect(() => {
    const element = stickyRef.current;
    if (!element) return;
    const measure = () => {
      const margin = measureChromeMargin();
      if (margin !== null) setStickyOffset(margin);
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [categories.length, viewMode, measureChromeMargin]);

  /**
   * Make sure a section can render before we jump to it. Only the target and
   * its immediate neighbours are requested — a jump to the last category must
   * not load every category above it.
   */
  const ensureSectionLoaded = React.useCallback((categoryId: string) => {
    const state = useMenuStore.getState();
    const bucket = state.buckets[categoryId];
    if (bucket && bucket.page > 0 && !bucket.loading && !bucket.error) return Promise.resolve();
    return Promise.resolve(state.loadMore(categoryId));
  }, []);

  const revealCategory = React.useCallback(
    async (categoryId: string, options?: { focusHeading?: boolean }) => {
      const state = useMenuStore.getState();
      const index = state.categories.findIndex((category) => category.id === categoryId);
      if (index < 0) return;
      const request = ++jumpRequestRef.current;

      jumpGuardRef.current = { id: categoryId, until: Date.now() + JUMP_GUARD_MS };
      state.setActiveCategory(categoryId);

      const neighbours = [state.categories[index - 1], state.categories[index + 1]]
        .filter((category): category is MenuCategoryModel => Boolean(category))
        .map((category) => category.id);
      // Load before scrolling so sections above the target have their real
      // height and the jump lands on the heading, not mid-section.
      await Promise.all(
        [...new Set([categoryId, ...neighbours])].map((id) => ensureSectionLoaded(id)),
      );

      // Let the loaded rows commit and the browser paint before measuring.
      // Two animation frames are required: a macrotask may still run before
      // React commits, which parked jumps on skeleton height. Recheck request
      // intent and outlet ownership after the async boundary.
      await afterNextPaint();
      const live = useMenuStore.getState();
      if (request !== jumpRequestRef.current || live.epoch !== state.epoch ||
          live.storeId !== state.storeId || currentStoreRef.current !== state.storeId ||
          !live.categories.some((category) => category.id === categoryId)) return;
      jumpGuardRef.current = { id: categoryId, until: Date.now() + JUMP_GUARD_MS };
      live.setActiveCategory(categoryId);

      const element = sectionRefs.current.get(categoryId);
      if (!element) return;

      // Re-measure the sticky chrome immediately before scrolling. On a cold
      // deep link the rail can mount after the first measurement, and a stale
      // scroll-margin lands the heading underneath the rail.
      const measuredMargin = measureChromeMargin();
      const landingMargin = measuredMargin ?? stickyOffset;
      if (measuredMargin !== null) {
        element.style.scrollMarginTop = `${measuredMargin}px`;
        setStickyOffset(measuredMargin);
      }

      // Scroll the WINDOW explicitly to the heading's measured position. Relying
      // on `scrollIntoView` + CSS `scroll-margin` proved unreliable in the
      // Android WebView on a cold deep link (the heading landed under the app
      // bar). The explicit delta is the same measurement the browser gate
      // verified, and it cannot be ignored by a nested scroller.
      const viewportTop = element.getBoundingClientRect().top + window.scrollY;
      const targetTop = Math.max(0, viewportTop - landingMargin);
      // Instant, not smooth: a smooth animation makes any follow-up correction
      // race the animation in the Android WebView and can overshoot the section
      // above the chrome. A menu jump is a positional change, not decoration.
      if (typeof window.scrollTo === "function") {
        window.scrollTo({ top: targetTop, behavior: "auto" });
      } else if (typeof element.scrollIntoView === "function") {
        element.scrollIntoView({ block: "start", behavior: "auto" });
      }

      // Final geometric correction: after layout settles, compare the real
      // heading position with the real (stuck) chrome bottom. Any estimate error
      // in the safe-area/app-bar measurement is removed here, because both
      // numbers are read from the live layout rather than assumed.
      if (jumpCorrectTimerRef.current !== null) {
        window.clearTimeout(jumpCorrectTimerRef.current);
      }
      jumpCorrectTimerRef.current = window.setTimeout(() => {
        jumpCorrectTimerRef.current = null;
        const railNow = stickyRef.current;
        if (!railNow || !element.isConnected) return;
        const chromeBottom = railNow.getBoundingClientRect().bottom;
        const delta = element.getBoundingClientRect().top - (chromeBottom + 8);
        if (Math.abs(delta) > 2) {
          window.scrollBy({ top: delta, behavior: "auto" });
        }
      }, 80);

      // Move focus to the heading (preventScroll keeps the measured landing).
      if (options?.focusHeading) {
        const heading = element.querySelector<HTMLElement>("h2");
        heading?.focus?.({ preventScroll: true });
      }
    },
    [ensureSectionLoaded],
  );

  const handleCategorySelect = React.useCallback(
    (categoryId: string) => {
      appliedParamRef.current = categoryId;
      setDeepLinkNotice(null);
      void navigate({
        to: "/menu",
        search: (prev: MenuSearchSchema) => ({ ...prev, category: categoryId }),
        replace: true,
      });
      void revealCategory(categoryId, { focusHeading: true });
    },
    [navigate, revealCategory],
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

  // Sync viewMode from the URL (back/forward included) without writing back.
  React.useEffect(() => {
    if (searchParams.view && (searchParams.view === "list" || searchParams.view === "grid")) {
      if (viewMode !== searchParams.view) setViewMode(searchParams.view);
    }
  }, [searchParams.view, viewMode, setViewMode]);

  const resolution = React.useMemo(
    () => resolveCategoryParam(searchParams.category, categories),
    [searchParams.category, categories],
  );

  /**
   * URL → position. Runs on deep link and on back/forward only: it never writes
   * the active section back into the URL, so scrolling cannot rewrite history
   * and the observer cannot feed itself.
   */
  React.useEffect(() => {
    if (resolution.status === "none") {
      setDeepLinkNotice(null);
      appliedParamRef.current = null;
      return;
    }
    if (categories.length === 0) return;

    if (resolution.status === "ambiguous") {
      // Never pick one of the candidates silently.
      setDeepLinkNotice(
        `More than one category matches “${resolution.param}”. Choose one from the categories above.`,
      );
      return;
    }
    if (resolution.status === "unknown") {
      setDeepLinkNotice(
        `We couldn't find a category called “${resolution.param}”. Here is the full menu instead.`,
      );
      return;
    }

    if (appliedParamRef.current === resolution.id) return;
    appliedParamRef.current = resolution.id;
    setDeepLinkNotice(null);
    void revealCategory(resolution.id, { focusHeading: false });

    if (resolution.param !== resolution.id) {
      // Canonicalise the URL on the real id so refresh/back-forward lands on
      // the same section. `replace` keeps the history entry count unchanged.
      void navigate({
        to: "/menu",
        search: (prev: MenuSearchSchema) => ({ ...prev, category: resolution.id }),
        replace: true,
      });
    }
  }, [resolution, categories.length, revealCategory, navigate]);

  // Active heading follows the viewport. Reads layout only — never the URL.
  React.useEffect(() => {
    if (categories.length === 0) return;
    let frame = 0;

    const measure = () => {
      frame = 0;

      const guard = jumpGuardRef.current;
      if (guard) {
        const target = sectionRefs.current.get(guard.id);
        const arrived = target
          ? Math.abs(target.getBoundingClientRect().top - stickyOffset) <= 12
          : true;
        // Hold the tapped section's highlight while its smooth scroll runs.
        if (!arrived && Date.now() < guard.until) return;
        jumpGuardRef.current = null;
      }

      const sections: SectionViewportPosition[] = [];
      for (const category of categories) {
        const element = sectionRefs.current.get(category.id);
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        // A zero-height section occupies no space (not yet laid out, or a
        // display:none viewport): it cannot be the section under the chrome.
        if (rect.height === 0) continue;
        sections.push({ id: category.id, top: rect.top });
      }
      const next = pickActiveSection(sections, stickyOffset);
      if (next && next !== useMenuStore.getState().activeCategoryId) setActiveCategory(next);
    };

    const schedule = () => {
      if (frame) return;
      if (typeof window.requestAnimationFrame !== "function") {
        measure();
        return;
      }
      frame = window.requestAnimationFrame(measure);
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    measure();
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [categories, stickyOffset, setActiveCategory]);

  /**
   * Open the customizer only with REAL details. A customizable product needs
   * its customization groups; opening the sheet with `customizations: []`
   * would let the customer add an incomplete item to the cart.
   */
  const openCustomizer = React.useCallback(
    async (product: Product) => {
      if (!store) return;
      const storeId = store.id;
      const request = ++customizerRequestRef.current;
      setCustomizerLoadingId(product.id);
      try {
        const result = await menuRepository.getProduct(product.id, storeId);
        if (request !== customizerRequestRef.current || currentStoreRef.current !== storeId) return;
        if (!result.success) {
          toast.error("Couldn't open this item", { description: toUserMessage(result) });
          return;
        }
        if (!result.data) {
          toast.error("This item isn't available at this store anymore.");
          return;
        }
        setCustomizerStoreId(storeId);
        setCustomizingProduct(result.data);
      } catch {
        if (request === customizerRequestRef.current && currentStoreRef.current === storeId) {
          toast.error("Couldn't open this item. Please try again.");
        }
      } finally {
        if (request === customizerRequestRef.current) setCustomizerLoadingId(null);
      }
    },
    [store],
  );

  const handleAdd = React.useCallback(
    async (product: Product) => {
      if (product.customizable) {
        void openCustomizer(product);
        return;
      }
      if (!store) return;
      const res = await cartRepository.addItem({
        storeId: store.id,
        productId: product.id,
        name: product.name,
        imageUrl: product.imageUrl,
        fallbackImageUrl: product.fallbackImageUrl,
        veg: product.veg ?? true,
        unitPrice: product.price,
        quantity: 1,
      });
      if (!res.success) {
        toast.error("Couldn't add to cart", {
          description: toUserMessage(res),
        });
        return;
      }

      void HapticService.impact("medium");

      toast.success(`✓ ${product.name} added`, {
        action: {
          label: "View Cart",
          onClick: () => {
            void navigate({ to: "/cart" });
          },
        },
        duration: 3000,
      });
    },
    [store, navigate, openCustomizer],
  );

  if (!store) return null;

  // First-paint guard: the store clears itself synchronously on a store switch,
  // but this render may already carry the new store id. Never paint the previous
  // store's categories/cards under it — show the loading shell until the store
  // state belongs to this store.
  const storeScopeMismatch = Boolean(menuStoreId) && menuStoreId !== store.id;
  const initialLoading =
    storeScopeMismatch || (status === "loading" && categories.length === 0);
  // Only claim an item total when every category reported a real count.
  const countedCategories = categories.filter(
    (category) => typeof category.itemCount === "number",
  );
  const totalItems =
    categories.length > 0 && countedCategories.length === categories.length
      ? countedCategories.reduce((sum, category) => sum + (category.itemCount ?? 0), 0)
      : undefined;

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
              className="rounded-[var(--radius-medium)] border border-warning/40 bg-warning/10 p-3 text-base font-medium text-amber-900 dark:text-amber-200"
            >
              You are offline. Menu may be out of date.
            </div>
          </div>
        )}

        {online && stale && categories.length > 0 && (
          <div className="px-4 pt-3">
            <div
              role="status"
              className="flex items-center justify-between gap-3 rounded-[var(--radius-medium)] border border-warning/40 bg-warning/10 p-3 text-base font-medium text-amber-900 dark:text-amber-200"
            >
              <span>Live updates paused{error ? ` (${error})` : ""} — showing last saved menu.</span>
              <button
                type="button"
                onClick={() => store && void load(store.id, { refresh: true })}
                className="min-h-[44px] shrink-0 rounded-lg bg-warning/20 px-3 text-sm font-bold cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Kitchen closed (11:00–23:00 IST): menu browsing stays open — the
            cart/checkout gates do the ordering. Renders nothing while open. */}
        <KitchenClosedBanner className="mx-4 mt-3" />

        {deepLinkNotice && (
          <div className="px-4 pt-3">
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-medium)] border border-warning/40 bg-warning/10 p-3 text-base font-medium text-amber-900 dark:text-amber-200"
            >
              <span className="min-w-0 flex-1">{deepLinkNotice}</span>
              <button
                type="button"
                onClick={() => {
                  setDeepLinkNotice(null);
                  appliedParamRef.current = null;
                  void navigate({
                    to: "/menu",
                    search: (prev: MenuSearchSchema) => ({ ...prev, category: undefined }),
                    replace: true,
                  });
                }}
                className="min-h-[44px] shrink-0 rounded-lg bg-warning/20 px-3 text-sm font-bold cursor-pointer"
              >
                Show full menu
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
            {/* Sticky chrome: category rail + view toggle. Its measured height
                is the scroll margin for every section jump. */}
            <div
              ref={stickyRef}
              className={cn("sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-20 bg-surface/95 backdrop-blur-md shadow-sm border-b border-divider", viewMode === "grid" && "flex items-center")}
            >
              <CategoryNavRail
                categories={categories}
                activeCategoryId={activeCategoryId}
                onSelectCategory={handleCategorySelect}
                className={viewMode === "grid" ? "min-w-0 flex-1 border-b-0 shadow-none" : undefined}
              />
              <div className={cn("flex items-center justify-between", viewMode === "grid" ? "shrink-0 gap-0 px-1 py-1" : "gap-3 px-4 py-2 border-t border-divider/40")}>
                <Text variant="bodyMedium" tone="secondary" className={cn("font-medium text-sm", viewMode === "grid" && "sr-only")}>
                  {categories.length} {categories.length === 1 ? "category" : "categories"}
                  {typeof totalItems === "number" ? ` • ${totalItems} items` : ""}
                </Text>
                <div className="flex items-center gap-1" role="group" aria-label="View mode">
                  <button
                    type="button"
                    aria-label="List view"
                    aria-pressed={viewMode === "list"}
                    onClick={() => handleViewModeToggle("list")}
                    className={cn(
                      "grid h-11 w-11 place-items-center rounded-xl transition-colors cursor-pointer",
                      viewMode === "list"
                        ? "bg-primary text-primary-foreground font-bold"
                        : "text-text-secondary hover:text-text",
                    )}
                  >
                    <ListIcon className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Grid view"
                    aria-pressed={viewMode === "grid"}
                    onClick={() => handleViewModeToggle("grid")}
                    className={cn(
                      "grid h-11 w-11 place-items-center rounded-xl transition-colors cursor-pointer",
                      viewMode === "grid"
                        ? "bg-primary text-primary-foreground font-bold"
                        : "text-text-secondary hover:text-text",
                    )}
                  >
                    <LayoutGrid className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
            </div>

            {/* Every real category, in the store's order, in one natural flow. */}
            <div className="pb-4">
              {categories.map((category) => (
                <MenuCategorySection
                  key={category.id}
                  category={category}
                  bucket={buckets[category.id]}
                  viewMode={viewMode}
                  stickyOffset={stickyOffset}
                  isActive={category.id === activeCategoryId}
                  onRegister={registerSection}
                  onVisible={ensureSectionLoaded}
                  onLoadMore={loadMore}
                  onAdd={handleAdd}
                />
              ))}
            </div>
            <p className="px-4 pb-2 text-center text-sm text-text-secondary">
              Tap a category above to jump to it.
            </p>
          </>
        )}
      </div>

      {customizerLoadingId && (
        <div role="status" className="sr-only">
          Loading item options…
        </div>
      )}

      {/* Customizable Product Modal */}
      {customizingProduct && customizerStoreId === store.id && (
        <ProductCustomizerModal
          product={customizingProduct}
          storeId={customizerStoreId}
          isOpen={Boolean(customizingProduct)}
          onClose={() => {
            customizerRequestRef.current += 1;
            setCustomizingProduct(null);
            setCustomizerStoreId(null);
            setCustomizerLoadingId(null);
          }}
        />
      )}

      {/* Persistent Floating Mini Cart Bar */}
      <FloatingCartBar compact={viewMode === "grid"} />
    </AppShell>
  );
}

export default MenuPage;
