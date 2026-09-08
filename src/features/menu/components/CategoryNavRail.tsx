import * as React from "react";
import { cn } from "@/lib/utils";
import type { MenuCategoryModel } from "@/features/menu/models";
import { HapticService } from "@/core/services/haptics";
import { useDirectionalScroll } from "@/shared/hooks/useDirectionalScroll";

interface Props {
  categories: MenuCategoryModel[];
  activeCategoryId: string | null | undefined;
  onSelectCategory: (id: string) => void;
  className?: string;
}

/**
 * CategoryNavRail — sticky horizontal category rail for the menu page.
 * Data-driven from the repository category list; selection only.
 */
export function CategoryNavRail({ categories, activeCategoryId, onSelectCategory, className }: Props) {
  const listRef = React.useRef<HTMLDivElement>(null);
  useDirectionalScroll(listRef);

  React.useEffect(() => {
    if (!activeCategoryId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLButtonElement>(
      `[data-cat-id="${CSS.escape(activeCategoryId)}"]`,
    );
    if (!el) return;
    const container = listRef.current;
    container.scrollTo({
      left: Math.max(0, el.offsetLeft - container.offsetWidth / 2 + el.offsetWidth / 2),
      behavior: "smooth",
    });
  }, [activeCategoryId]);

  if (categories.length === 0) return null;

  return (
    <div ref={listRef} role="tablist" aria-label="Menu categories" className={cn("flex gap-2 overflow-x-auto no-scrollbar touch-pan-y px-4 py-2", className)}>
      {categories.map((c) => {
        const active = c.id === activeCategoryId;
        return (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-cat-id={c.id}
            onClick={() => {
              void HapticService.impact("light");
              onSelectCategory(c.id);
            }}
            className={cn(
              "flex-none shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold border transition-all active:scale-[0.96] cursor-pointer min-h-[44px]",
              active
                ? "bg-[#0E4825] text-white border-[#0E4825]"
                : "bg-surface text-text-secondary border-divider hover:border-primary/40",
            )}
          >
            {c.name}
            {typeof c.itemCount === "number" && c.itemCount > 0 && (
              <span className="ml-1 opacity-70">({c.itemCount})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
