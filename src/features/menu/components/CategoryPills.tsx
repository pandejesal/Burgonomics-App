import * as React from "react";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";

export interface CategoryItem {
  id: string;
  name: string;
  count?: number;
  isVeg?: boolean;
}

const DEFAULT_CATEGORIES: CategoryItem[] = [
  { id: "all", name: "All Items" },
  { id: "burgers", name: "Smashed Burgers", isVeg: true },
  { id: "wraps", name: "Crispy Wraps", isVeg: true },
  { id: "combos", name: "Value Combos", isVeg: true },
  { id: "sides", name: "Fries & Sides", isVeg: true },
  { id: "beverages", name: "Shakes & Drinks", isVeg: true },
];

interface CategoryPillsProps {
  categories?: CategoryItem[];
  selectedCategory: string;
  onSelectCategory: (categoryId: string) => void;
  className?: string;
}

export function CategoryPills({
  categories = DEFAULT_CATEGORIES,
  selectedCategory,
  onSelectCategory,
  className,
}: CategoryPillsProps) {
  const handleSelect = (id: string) => {
    void HapticService.selection();
    onSelectCategory(id);
  };

  return (
    <div
      className={cn(
        "w-full overflow-x-auto no-scrollbar py-1 flex items-center gap-2 select-none",
        className
      )}
    >
      {categories.map((cat) => {
        const isSelected = selectedCategory === cat.id;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => handleSelect(cat.id)}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer border",
              isSelected
                ? "bg-primary text-white border-primary shadow-xs"
                : "bg-surface text-text-secondary border-divider hover:text-text hover:border-primary/40"
            )}
          >
            {cat.isVeg && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            )}
            <span>{cat.name}</span>
            {cat.count !== undefined && (
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold",
                  isSelected ? "bg-white/20 text-white" : "bg-bg-secondary text-text-secondary"
                )}
              >
                {cat.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default CategoryPills;
