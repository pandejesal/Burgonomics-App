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
import { cartRepository } from "@/features/cart/repositories/CartRepository";
import { useMenuStore } from "@/features/menu/state/menuStore";
import { useDemoStore } from "@/features/demo/state/demoStore";
import { CategoryTabs } from "@/features/menu/components/CategoryTabs";
import { MenuProductCard } from "@/features/menu/components/MenuProductCard";
import { MenuSkeleton } from "@/features/menu/components/MenuSkeleton";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { useAppConfig } from "@/core/state/appConfigStore";
import type { Product } from "@/features/menu/models";
import { cn } from "@/lib/utils";
import { isNative } from "@/shared/platform/platform";

/**
 * SCR-006 Menu. Fully data-driven — categories, products, badges,
 * prices, availability all come from the repository. Never hardcoded.
 */
export const Route = createFileRoute("/menu/")({
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
        void navigate({ to: "/menu/product/$productId", params: { productId: p.id } });
        return;
      }
      if (!store) return;
      void cartRepository.addItem({
        storeId: store.id,
        productId: p.id,
        name: p.name,
        imageUrl: p.imageUrl,
        fallbackImageUrl: p.fallbackImageUrl,
        veg: p.veg,
        unitPrice: p.price,
        quantity: 1,
      });

      void HapticService.impact("medium");

      toast(`✓ ${p.name} added`, {
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

  if (!store) return null;

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
          className="grid h-11 w-11 place-items-center rounded-full hover:bg-bg-secondary"
        >
          <Search className="h-5 w-5" aria-hidden />
        </Link>
      }
    >
      <div className="mx-auto max-w-[720px]">
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
            <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-20 -mx-0 bg-surface/95 backdrop-blur-md shadow-low border-b border-divider">
              <CategoryTabs
                categories={categories}
                activeId={activeCategoryId}
                onSelect={setActiveCategory}
              />
              <div className="flex items-center justify-between px-4 py-2 border-t border-divider/40">
                <Text variant="bodyMedium" tone="secondary">
                  {bucket?.total ? `${bucket.total} items` : ""}
                </Text>
                <div className="flex items-center gap-1" role="group" aria-label="View mode">
                  <button
                    type="button"
                    aria-label="List view"
                    aria-pressed={viewMode === "list"}
                    onClick={() => setViewMode("list")}
                    className={cn(
                      "grid h-9 w-9 place-items-center rounded-full transition-colors",
                      viewMode === "list"
                        ? "bg-primary/10 text-primary font-bold"
                        : "text-text-secondary hover:text-text-primary",
                    )}
                  >
                    <ListIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Grid view"
                    aria-pressed={viewMode === "grid"}
                    onClick={() => setViewMode("grid")}
                    className={cn(
                      "grid h-9 w-9 place-items-center rounded-full transition-colors",
                      viewMode === "grid"
                        ? "bg-primary/10 text-primary font-bold"
                        : "text-text-secondary hover:text-text-primary",
                    )}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <section aria-live="polite" className="px-4 py-4">
              {bucket?.loading && !bucket.items.length ? (
                <MenuSkeleton rows={5} />
              ) : bucket?.error && !bucket.items.length ? (
                <FailureState
                  title="We couldn't load this category"
                  message={bucket.error}
                  onRetry={() => activeCategoryId && loadMore(activeCategoryId)}
                />
              ) : bucket && bucket.items.length === 0 ? (
                <EmptyState
                  title="Nothing here yet"
                  description="This category has no available items right now."
                />
              ) : (
                <div className={cn(viewMode === "grid" ? "grid grid-cols-2 gap-3" : "space-y-3")}>
                  {bucket?.items.map((p) => (
                    <MenuProductCard
                      key={p.id}
                      product={p}
                      layout={viewMode === "grid" ? "grid" : "row"}
                      onAdd={handleAdd}
                    />
                  ))}
                </div>
              )}

              {bucket?.hasMore && (
                <div ref={sentinelRef} className="py-6 text-center">
                  <span className="type-caption text-text-secondary">
                    {bucket.loading ? "Loading more…" : "Scroll for more"}
                  </span>
                </div>
              )}
              {bucket && !bucket.hasMore && bucket.items.length > 0 && (
                <p className="py-6 text-center type-caption text-text-secondary">
                  You've reached the end.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
