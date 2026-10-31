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
 * not every WebView we ship to is guaranteed to expose `CSS.escape` â€” a missing
 * one would throw and blank the whole rail. Scanning the (â‰¤ ~20) children
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
 * CategoryNavRail â€” sticky horizontal category navigation.
 *
 * This is a nav of in-page jumps over ONE continuous menu, not a tab set:
 * every category section stays mounted in natural vertical flow and the chip
 * only decides where the viewport lands. `role="tablist"`/`tab` used to
 * promise mutually exclusive panels that no longer exist (and would still be
 * wrong for a page where all sections are visible at once).
 */
export function CategoryNavRail({
  categories,
  activeCategoryId,
  onSelectCategory,
  className,
}: CategoryNavRailProps) {
  const scrollRef = React.useRef<HTMLElement>(null);
  const alignedRef = React.useRef<AlignedGeometry | null>(null);

  /**
   * Centre `categoryId`'s chip. Records the geometry it centred on so the
   * drift check below can tell "the chips re-flowed" (a real reason to
   * re-centre) from "the user dragged the rail" (scrollLeft only â€” leave it).
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
    // Already centred (within sub-pixel rounding): skip â€” a redundant
    // `scrollTo` would restart any in-flight animation for no visual change.
    if (Math.abs(container.scrollLeft - target) < 0.5) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    container.scrollTo({ left: target, behavior: reduced ? "instant" : behavior });
  }, []);

  // Selection changed â†’ bring the active chip to the middle of the rail.
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
    if (
      chip &&
      aligned?.id === activeCategoryId &&
      aligned.offsetLeft === chip.offsetLeft &&
      aligned.offsetWidth === chip.offsetWidth &&
      aligned.clientWidth === container.clientWidth &&
      aligned.scrollWidth === container.scrollWidth
    )
      return;
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
        className,
      )}
    >
      <nav
        ref={scrollRef}
        aria-label="Menu categories"
        className="relative flex items-center gap-2 overflow-x-auto no-scrollbar select-none py-1 touch-pan-x overscroll-x-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {categories.map((cat) => {
          const isSelected = activeCategoryId === cat.id;
          const countLabel =
            typeof cat.itemCount === "number" && cat.itemCount > 0
              ? `, ${cat.itemCount} items`
              : "";
          return (
            <button
              key={cat.id}
              type="button"
              data-category-id={cat.id}
              aria-current={isSelected ? "true" : undefined}
              aria-label={`${isSelected ? "Current category: " : "Jump to "}${cat.name}${countLabel}`}
              onClick={() => handleSelect(cat.id)}
              className={cn(
                "group relative flex-none shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all duration-150 ease-out select-none active:scale-[0.96] active:opacity-85 cursor-pointer min-h-[44px] border",
                isSelected
                  ? "bg-primary text-primary-foreground border-primary shadow-sm font-extrabold"
                  : "bg-surface text-text-secondary border-divider hover:text-text hover:border-primary/40",
              )}
            >
              {/* Veg Indicator dot for 100% Pure Veg menu */}
              <span
                className={cn(
                  "w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center shrink-0",
                  isSelected
                    ? "border-primary-foreground/70 bg-primary-foreground/15"
                    : "border-primary/50 bg-primary/5",
                )}
                aria-hidden
              >
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    isSelected ? "bg-primary-foreground" : "bg-primary-text",
                  )}
                />
              </span>

              <span>{cat.name}</span>

              {typeof cat.itemCount === "number" && cat.itemCount > 0 && (
                <span
                  className={cn(
                    "text-[11px] px-2 py-0.5 rounded-full font-mono font-bold leading-none",
                    isSelected
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-bg-secondary text-text-secondary group-hover:text-text",
                  )}
                >
                  {cat.itemCount}
                </span>
              )}

              {/* Selection marker beyond colour: a solid underline that also
                  survives forced-colours / high-contrast modes. */}
              {isSelected && (
                <span
                  aria-hidden
                  data-testid="category-rail-active-marker"
                  className="pointer-events-none absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary-foreground"
                />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default CategoryNavRail;
