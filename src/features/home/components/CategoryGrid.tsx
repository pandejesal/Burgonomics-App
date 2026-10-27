import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Coffee,
  Pizza,
  ShoppingBag,
  Soup,
  UtensilsCrossed,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SafeImage } from "@/shared/components/common/SafeImage";
import { useMenuStore } from "@/features/menu/state/menuStore";
import { HapticService } from "@/core/services/haptics";
import type { MenuCategory } from "@/features/menu/services/menuService";

interface Props {
  categories: MenuCategory[];
  className?: string;
}

function getCategoryIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("burger")) return UtensilsCrossed;
  if (lower.includes("pizza")) return Pizza;
  if (lower.includes("pasta")) return Soup;
  if (
    lower.includes("shake") ||
    lower.includes("drink") ||
    lower.includes("beverage") ||
    lower.includes("cooler")
  ) {
    return Coffee;
  }
  return ShoppingBag;
}

function CategoryTile({
  c,
  onClick,
}: {
  c: MenuCategory;
  onClick: () => void;
}) {
  const Icon = getCategoryIcon(c.name);
  const [imageError, setImageError] = React.useState(false);

  React.useEffect(() => {
    setImageError(false);
  }, [c.imageUrl]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Browse ${c.name}, ${c.itemCount} items`}
      className={cn(
        "group flex flex-col items-center justify-center rounded-2xl border border-border bg-surface p-3 text-center shadow-low",
        "transition-all duration-200 hover:border-primary/40 hover:shadow-medium active:scale-[0.98]",
      )}
    >
      {/* Circular food thumbnail with 2px Forest Green ring */}
      <div className="relative mb-2 grid h-16 w-16 place-items-center overflow-hidden rounded-full border-2 border-primary/30 bg-primary/5 p-0.5 shadow-xs transition-transform duration-300 group-hover:scale-105 group-hover:border-primary">
        {c.imageUrl && !imageError ? (
          <SafeImage
            src={c.imageUrl}
            alt={c.name}
            loading="lazy"
            decoding="async"
            onError={() => setImageError(true)}
            className="h-full w-full rounded-full object-cover"
          />
        ) : (
          <Icon className="h-7 w-7 text-primary" aria-hidden />
        )}
      </div>

      {/* Category Name */}
      <h4 className="w-full truncate font-sans text-xs font-bold text-text-primary group-hover:text-primary transition-colors">
        {c.name}
      </h4>

      {/* Item Count */}
      <span className="mt-0.5 text-[10px] font-medium text-text-secondary">
        {c.itemCount ? `${c.itemCount} items` : "Explore"}
      </span>
    </button>
  );
}

export function CategoryGrid({ categories, className }: Props) {
  const navigate = useNavigate();
  const setActiveCategory = useMenuStore((s) => s.setActiveCategory);

  if (categories.length === 0) return null;

  return (
    <div className={cn("px-4", className)}>
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {categories.map((c) => (
          <CategoryTile
            key={c.id}
            c={c}
            onClick={() => {
              void HapticService.selection();
              setActiveCategory(c.id);
              void navigate({
                to: "/menu",
                search: { category: c.id },
              });
            }}
          />
        ))}
      </div>
    </div>
  );
}
