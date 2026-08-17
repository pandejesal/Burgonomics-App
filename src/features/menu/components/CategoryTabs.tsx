import * as React from "react";
import { cn } from "@/lib/utils";
import type { MenuCategoryModel } from "@/features/menu/models";
import { motion } from "motion/react";
import { HapticService } from "@/core/services/haptics";

interface Props {
  categories: MenuCategoryModel[];
  activeId?: string;
  onSelect: (id: string) => void;
  className?: string;
}

/**
 * Sticky, horizontally scrollable category tab bar. Supports an
 * unlimited number of dynamic categories from the repository.
 * Minimum 44dp touch target height with tactile haptic impact on selection.
 */
export function CategoryTabs({ categories, activeId, onSelect, className }: Props) {
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!activeId || !listRef.current) return;
    const container = listRef.current;
    const el = container.querySelector<HTMLButtonElement>(
      `[data-cat-id="${CSS.escape(activeId)}"]`,
    );
    if (!el) return;
    const targetLeft = el.offsetLeft - container.offsetWidth / 2 + el.offsetWidth / 2;
    container.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
  }, [activeId]);

  return (
    <div
      role="tablist"
      aria-label="Menu categories"
      ref={listRef}
      className={cn(
        "flex gap-2 overflow-x-auto no-scrollbar px-4 py-2 [overscroll-behavior-x:contain]",
        className,
      )}
    >
      {categories.map((c) => {
        const active = c.id === activeId;
        return (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-cat-id={c.id}
            onClick={() => {
              void HapticService.impact("light");
              onSelect(c.id);
            }}
            className={cn(
              "group relative flex-none whitespace-nowrap rounded-full px-4.5 py-2 type-label-large transition-all duration-150 ease-out select-none active:scale-[0.96] active:opacity-85",
              "min-h-[40px] border overflow-hidden flex items-center justify-center cursor-pointer",
              active
                ? "text-primary-foreground border-primary bg-primary shadow-sm"
                : "border-divider bg-surface text-text-secondary hover:text-text-primary hover:border-primary/40",
            )}
          >
            {active && (
              <motion.div
                layoutId="activeCategoryBg"
                className="absolute inset-0 bg-primary shadow-sm"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                style={{ zIndex: 0 }}
              />
            )}
            <span className="relative z-10 flex items-center">
              {c.name}
              {typeof c.itemCount === "number" && c.itemCount > 0 && (
                <span className={cn("ml-1.5 type-caption", active ? "opacity-90" : "opacity-60")}>
                  ({c.itemCount})
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
