import * as React from "react";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";
import type { MenuCategoryModel } from "../models";

interface CategoryNavRailProps {
  categories: MenuCategoryModel[];
  activeCategoryId?: string | null;
  onSelectCategory: (categoryId: string) => void;
  className?: string;
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

  // Auto-scroll active category into horizontal center view
  React.useEffect(() => {
    if (!activeCategoryId || !scrollRef.current) return;
    const container = scrollRef.current;
    const el = container.querySelector<HTMLButtonElement>(
      `[data-category-id="${CSS.escape(activeCategoryId)}"]`
    );
    if (!el) return;
    const targetLeft = el.offsetLeft - container.offsetWidth / 2 + el.offsetWidth / 2;
    container.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
  }, [activeCategoryId]);

  const handleSelect = (id: string) => {
    void HapticService.selection();
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
        className="flex items-center gap-2 overflow-x-auto no-scrollbar select-none py-1"
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
