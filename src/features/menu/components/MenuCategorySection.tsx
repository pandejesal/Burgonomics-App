import * as React from "react";
import { MenuProductCard } from "./MenuProductCard";
import { MenuSkeleton } from "./MenuSkeleton";
import type { MenuCategoryModel, Product } from "../models";
import type { MenuCategoryBucket } from "../state/menuSnapshot";
import { cn } from "@/lib/utils";

export const MENU_SECTION_PREFIX = "menu-section-";
export const sectionDomId = (categoryId: string) => `${MENU_SECTION_PREFIX}${categoryId}`;
export const sectionHeadingId = (categoryId: string) =>
  `${MENU_SECTION_PREFIX}heading-${categoryId}`;

/**
 * Eager pagination stops after this many pages (6 × 20 = 120 items) per
 * section. A long menu therefore cannot paint hundreds of cards from one
 * unsticky scroll; the explicit "Load more" control keeps working past the
 * cap, so nothing is unreachable, it just stops being automatic.
 */
export const MAX_AUTO_PAGES = 6;

/** Distance at which a section's first page is fetched before it is on screen. */
const INITIAL_ROOT_MARGIN = "600px 0px";
/** Distance at which the next page auto-loads while scrolling through a section. */
const PAGE_ROOT_MARGIN = "400px 0px";

interface MenuCategorySectionProps {
  category: MenuCategoryModel;
  bucket?: MenuCategoryBucket;
  viewMode: "list" | "grid";
  /** Measured sticky chrome height (px) used as `scroll-margin-top`. */
  stickyOffset: number;
  isActive: boolean;
  onRegister: (categoryId: string, element: HTMLElement | null) => void;
  onVisible: (categoryId: string) => void;
  onLoadMore: (categoryId: string) => void;
  onAdd: (product: Product) => void;
}

/**
 * One real category of the continuous menu: heading + its products in natural
 * page flow. Sections never replace each other — category A's last row is
 * followed by category B's heading.
 *
 * Loading is per section and lazy: the first page is requested when the
 * section comes within one screen of the viewport, later pages while the
 * reader is inside it. The store additionally caps concurrent reads, so
 * scrolling fast queues categories instead of firing them all.
 */
export function MenuCategorySection({
  category,
  bucket,
  viewMode,
  stickyOffset,
  isActive,
  onRegister,
  onVisible,
  onLoadMore,
  onAdd,
}: MenuCategorySectionProps) {
  const sectionRef = React.useRef<HTMLElement | null>(null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const element = sectionRef.current;
    onRegister(category.id, element);
    return () => onRegister(category.id, null);
  }, [category.id, onRegister]);

  // First page: fetch slightly before the section can be seen.
  React.useEffect(() => {
    const element = sectionRef.current;
    if (!element || bucket) return;
    if (typeof IntersectionObserver === "undefined") {
      onVisible(category.id);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        onVisible(category.id);
      },
      { rootMargin: INITIAL_ROOT_MARGIN },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [category.id, bucket, onVisible]);

  // Later pages: expand while the reader is still inside this category, so the
  // next category never starts before this one's real items have flowed in.
  React.useEffect(() => {
    const element = sentinelRef.current;
    if (!element || !bucket?.hasMore || bucket.loading || bucket.error) return;
    if (typeof IntersectionObserver === "undefined") return;
    if (bucket.page >= MAX_AUTO_PAGES) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore(category.id);
      },
      { rootMargin: PAGE_ROOT_MARGIN },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [bucket?.hasMore, bucket?.loading, bucket?.error, bucket?.page, category.id, onLoadMore]);

  const isGrid = viewMode === "grid";
  const items = bucket?.items ?? [];
  const loading = bucket?.loading ?? false;
  const error = bucket?.error;
  const firstPaintPending = !bucket || (loading && items.length === 0);
  // 2 columns from 320 CSS px: a 360px phone must fit 2 x 2 full cards. The
  // old `grid-cols-1 min-[380px]:grid-cols-2` gate rendered ONE column on a
  // 360px device, which is why only two items were visible per screen.
  const layoutClass = viewMode === "grid" ? "grid grid-cols-2 gap-2" : "space-y-4";

  return (
    <section
      ref={sectionRef}
      id={sectionDomId(category.id)}
      aria-labelledby={sectionHeadingId(category.id)}
      data-menu-category={category.id}
      data-menu-category-active={isActive ? "true" : undefined}
      // Jump landing + focus stay below the sticky chrome even at 200% zoom.
      style={{ scrollMarginTop: stickyOffset }}
      className={cn("px-4", isGrid ? "pt-3" : "pt-6")}
    >
      <div
        className={cn(
          "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1",
          isGrid ? "pb-2" : "pb-3",
        )}
      >
        <h2
          id={sectionHeadingId(category.id)}
          tabIndex={-1}
          className="text-xl font-semibold leading-snug text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded-sm"
        >
          {category.name}
        </h2>
        {typeof category.itemCount === "number" && category.itemCount > 0 && (
          <span className="text-sm text-text-secondary font-medium">
            {category.itemCount} {category.itemCount === 1 ? "item" : "items"}
          </span>
        )}
      </div>

      {error && items.length === 0 ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-medium)] border border-error/30 bg-error/5 p-3"
        >
          <p className="min-w-0 flex-1 text-base text-text-secondary">
            We couldn't load {category.name}. {error}
          </p>
          <button
            type="button"
            onClick={() => onLoadMore(category.id)}
            className="min-h-[44px] shrink-0 rounded-lg border border-primary/40 px-4 text-sm font-bold text-primary-text hover:bg-primary/10 cursor-pointer"
          >
            Try again
          </button>
        </div>
      ) : items.length > 0 ? (
        <div
          className={layoutClass}
          // Two columns at ordinary phone text sizes; a rem-based minimum lets
          // enlarged text reflow to one column without squeezing tap controls.
          style={
            viewMode === "grid"
              ? {
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(min(100%, max(8rem, calc(50% - 0.25rem))), 1fr))",
                }
              : undefined
          }
        >
          {items.map((product) => (
            <MenuProductCard
              key={product.id}
              product={product}
              layout={viewMode === "grid" ? "grid" : "row"}
              onAdd={onAdd}
            />
          ))}
        </div>
      ) : firstPaintPending ? (
        <MenuSkeleton rows={3} />
      ) : (
        <p className="py-4 text-base text-text-secondary">
          No items are available in {category.name} right now.
        </p>
      )}

      {loading && items.length > 0 && <MenuSkeleton rows={2} />}

      {error && items.length > 0 && (
        <div
          role="status"
          className="mt-3 flex flex-wrap items-center gap-3 text-sm text-text-secondary"
        >
          <span>Some items in {category.name} couldn't refresh.</span>
          <button
            type="button"
            onClick={() => onLoadMore(category.id)}
            className="min-h-[44px] rounded-lg border border-divider px-3 font-bold text-primary-text hover:bg-primary/10 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && bucket?.hasMore && (
        <div ref={sentinelRef} className="py-4 text-center">
          <button
            type="button"
            onClick={() => onLoadMore(category.id)}
            className="min-h-[44px] rounded-full border border-divider bg-surface px-5 text-sm font-bold text-primary-text hover:bg-primary/5 cursor-pointer"
          >
            Load more {category.name} items
          </button>
        </div>
      )}

      {/* A quiet separator keeps the continuous flow readable without claiming
          an "end" that pagination hasn't reached. */}
      <div className="mt-6 h-px bg-divider/60" aria-hidden />
    </section>
  );
}
