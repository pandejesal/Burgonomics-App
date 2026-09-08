import * as React from "react";
import { cn } from "@/lib/utils";
import type { MenuCategoryModel } from "@/features/menu/models";
import { menuRepository } from "@/features/menu/repositories/MenuRepository";
import { HapticService } from "@/core/services/haptics";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useDirectionalScroll } from "@/shared/hooks/useDirectionalScroll";

interface Props {
  selectedCategory: string;
  onSelectCategory: (id: string) => void;
  categories?: MenuCategoryModel[];
  className?: string;
}

/**
 * CategoryPills — shortcut pills over the repository category list.
 * Pure navigation: tapping routes to /menu (optionally filtered).
 * When no categories are passed, loads them for the active store.
 * Renders nothing while loading/empty — never invented pills.
 */
export function CategoryPills({ selectedCategory, onSelectCategory, categories: provided, className }: Props) {
  const listRef = React.useRef<HTMLDivElement>(null);
  useDirectionalScroll(listRef);
  const storeId = useStoreSelection((s) => s.activeStore?.id);
  const [loaded, setLoaded] = React.useState<MenuCategoryModel[]>([]);

  React.useEffect(() => {
    if (provided) return;
    let cancelled = false;
    void menuRepository.listCategories(storeId).then((res) => {
      if (!cancelled && res.success) setLoaded(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [provided, storeId]);

  const categories = provided ?? loaded;
  if (categories.length === 0) return null;

  const pills = [{ id: "all", name: "All" }, ...categories];

  return (
    <div ref={listRef} className={cn("flex gap-2 overflow-x-auto no-scrollbar touch-pan-y", className)} role="tablist" aria-label="Categories">
      {pills.map((c) => {
        const active = c.id === selectedCategory;
        return (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              void HapticService.impact("light");
              onSelectCategory(c.id);
            }}
            className={cn(
              "flex-none shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold border transition-all active:scale-[0.96] cursor-pointer min-h-[44px]",
              active
                ? "bg-[#FF6600] text-white border-[#FF6600]"
                : "bg-surface text-text-secondary border-divider hover:border-primary/40",
            )}
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
