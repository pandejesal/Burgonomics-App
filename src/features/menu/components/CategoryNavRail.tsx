import * as React from "react";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";
import { centerScrollLeft } from "../utils/categoryScroll";
import type { MenuCategoryModel } from "../models";

interface CategoryNavRailProps {
  categories: MenuCategoryModel[];
  activeCategoryId?: string | null;
  onSelectCategory: (categoryId: string) => void;
  className?: string;
}

/**
 * Find the chip for a category by its `data-category-id`.
 *
 * A `querySelector` + `CSS.escape` build works, but ids come from Petpooja and
 * not every WebView we ship to is guaranteed to expose `CSS.escape` — a missing
 * one would throw and blank the whole rail. Scanning the (≤ ~20) children
 * cannot throw on an id, and costs less than escaping + parsing a selector.
 */
function findChip(container: HTMLElement, categoryId: string): HTMLButtonElement | null {
  for (const child of container.children) {
    if (child instanceof HTMLButtonElement && child.dataset.categoryId === categoryId) {
      return child;
    }
  }
  return null;
}

/** Geometry the rail was aligned to the last time it centred `id`. */
interface AlignedGeometry {
  id: string;
  offsetLeft: number;
  offsetWidth: number;
  clientWidth: number;
  scrollWidth: number;
}

/**
 * CategoryNavRail — Sticky horizontal category navigation bar.
 * Follows strict 60-30-10 palette with #0E4825 Forest Green active chips,
 * 100% Pure Veg indicator dots, item counts, and smooth center-scroll sync.
 */
export function CategoryNavRail({
  categories,
  activeCategoryId,
  onSelectCategory,
  className,
}: CategoryNavRailProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const alignedRef = React.useRef<AlignedGeometry | null>(null);

  /**
   * Centre `categoryId`'s chip. Records the geometry it centred on so the
   * drift check below can tell "the chips re-flowed" (a real reason to
   * re-centre) from "the user dragged the rail" (scrollLeft only — leave it).
   */
  const centerOn = React.useCallback((categoryId: string, behavior: ScrollBehavior) => {
    const container = scrollRef.current;
    if (!container) return;
    const chip = findChip(container, categoryId);
    if (!chip) return;

    const geometry: AlignedGeometry = {
      id: categoryId,
      offsetLeft: chip.offsetLeft,
      offsetWidth: chip.offsetWidth,
      clientWidth: container.clientWidth,
      scrollWidth: container.scrollWidth,
    };
    alignedRef.current = geometry;

    const target = centerScrollLeft({
      offsetLeft: geometry.offsetLeft,
      offsetWidth: geometry.offsetWidth,
      clientWidth: geometry.clientWidth,
      scrollWidth: container.scrollWidth,
    });
    // Already centred (within sub-pixel rounding): skip — a redundant
    // `scrollTo` would restart any in-flight animation for no visual change.
    if (Math.abs(container.scrollLeft - target) < 0.5) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    container.scrollTo({ left: target, behavior: reduced ? "instant" : behavior });
  }, []);

  // Selection changed → bring the active chip to the middle of the rail.
  // The first alignment (mount / `?category=` deep link) jumps; later taps glide.
  React.useLayoutEffect(() => {
    if (!activeCategoryId) return;
    const container = scrollRef.current;
    if (!container) return;
    const chips = Array.from(container.children) as HTMLButtonElement[];
    // Space at both ends lets even the first/last category reach the middle.
    container.style.paddingLeft = `${Math.max(0, (container.clientWidth - (chips[0]?.offsetWidth ?? 0)) / 2)}px`;
    container.style.paddingRight = `${Math.max(0, (container.clientWidth - (chips.at(-1)?.offsetWidth ?? 0)) / 2)}px`;
    const chip = findChip(container, activeCategoryId);
    const aligned = alignedRef.current;
    if (chip && aligned?.id === activeCategoryId &&
        aligned.offsetLeft === chip.offsetLeft && aligned.offsetWidth === chip.offsetWidth &&
        aligned.clientWidth === container.clientWidth && aligned.scrollWidth === container.scrollWidth) return;
    centerOn(activeCategoryId, alignedRef.current ? "smooth" : "instant");
  }, [activeCategoryId, categories, centerOn]);

  // Observe real layout changes, not scrollLeft: manual dragging must remain
  // free while resize, fonts and live item counts can change centering geometry.
  React.useEffect(() => {
    const container = scrollRef.current;
    if (!container || !activeCategoryId) return;

    const reconcile = () => {
      const chips = Array.from(container.children) as HTMLButtonElement[];
      container.style.paddingLeft = `${Math.max(0, (container.clientWidth - (chips[0]?.offsetWidth ?? 0)) / 2)}px`;
      container.style.paddingRight = `${Math.max(0, (container.clientWidth - (chips.at(-1)?.offsetWidth ?? 0)) / 2)}px`;
      const chip = findChip(container, activeCategoryId);
      if (!chip) return;
      const aligned = alignedRef.current;
      const drifted =
        !aligned ||
        aligned.id !== activeCategoryId ||
        aligned.offsetLeft !== chip.offsetLeft ||
        aligned.offsetWidth !== chip.offsetWidth ||
        aligned.clientWidth !== container.clientWidth ||
        aligned.scrollWidth !== container.scrollWidth;
      if (drifted) centerOn(activeCategoryId, "smooth");
    };

    window.addEventListener("resize", reconcile);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(reconcile);
    observer?.observe(container);
    for (const chip of container.children) observer?.observe(chip);
    return () => {
      window.removeEventListener("resize", reconcile);
      observer?.disconnect();
    };
  }, [activeCategoryId, centerOn]);

  const handleSelect = (id: string) => {
    void HapticService.selection();
    centerOn(id, "smooth");
    onSelectCategory(id);
  };

  return (
    <div
      className={cn(
        "sticky top-0 z-20 w-full bg-surface/95 backdrop-blur-md border-b border-divider py-2 px-3 sm:px-4 shadow-xs",
        className
      )}
    >
      <div
        ref={scrollRef}
        role="tablist"
        aria-label="Menu categories"
        className="relative flex items-center gap-2 overflow-x-auto no-scrollbar select-none py-1 touch-pan-x overscroll-x-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {categories.map((cat) => {
          const isSelected = activeCategoryId === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              data-category-id={cat.id}
              aria-selected={isSelected}
              onClick={() => handleSelect(cat.id)}
              className={cn(
                "group relative flex-none shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-150 ease-out select-none active:scale-[0.96] active:opacity-85 cursor-pointer min-h-[44px] border",
                isSelected
                  ? "bg-[#0E4825] text-white border-[#0E4825] shadow-sm font-extrabold"
                  : "bg-surface text-text-secondary border-divider hover:text-text hover:border-primary/40"
              )}
            >
              {/* Veg Indicator dot for 100% Pure Veg menu */}
              <div
                className={cn(
                  "w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center shrink-0",
                  isSelected
                    ? "border-emerald-400 bg-emerald-950/40"
                    : "border-emerald-600 bg-emerald-950/10"
                )}
                aria-label="100% Pure Vegetarian"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </div>

              <span>{cat.name}</span>

              {typeof cat.itemCount === "number" && cat.itemCount > 0 && (
                <span
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full font-mono font-bold leading-none",
                    isSelected
                      ? "bg-white/20 text-[#4ADE80]"
                      : "bg-bg-secondary text-text-secondary group-hover:text-text"
                  )}
                >
                  {cat.itemCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default CategoryNavRail;
