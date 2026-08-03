import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Text } from "@/shared/components/common/Text";
import { SafeImage } from "@/shared/components/common/SafeImage";
import { useMenuStore } from "@/features/menu/state/menuStore";
import type { MenuCategory } from "@/features/menu/services/menuService";

interface Props {
  categories: MenuCategory[];
  className?: string;
}

/**
 * Fully dynamic category grid. Categories originate from Petpooja
 * menu synchronization. Renders category images and selects active
 * category on menu page when clicked.
 */
export function CategoryGrid({ categories, className }: Props) {
  const navigate = useNavigate();
  const setActiveCategory = useMenuStore((s) => s.setActiveCategory);

  if (categories.length === 0) return null;
  return (
    <nav aria-label="Menu categories" className={cn("px-4", className)}>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {categories.map((c) => {
          const initial = c.name.trim().charAt(0).toUpperCase() || "•";
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  setActiveCategory(c.id);
                  void navigate({ to: "/menu" });
                }}
                aria-label={`Browse ${c.name}, ${c.itemCount} items`}
                className={cn(
                  "group flex flex-col items-center gap-2 rounded-[var(--radius-large)] w-full text-left cursor-pointer",
                  "border border-transparent bg-surface p-2.5",
                  "hover:border-divider hover:shadow-[var(--shadow-low)]",
                  "transition-all duration-200 active:scale-[0.97]",
                )}
              >
                <span
                  className="relative grid h-14 w-14 overflow-hidden place-items-center rounded-full bg-primary/10 text-primary type-title-large shadow-xs"
                  aria-hidden
                >
                  {c.imageUrl ? (
                    <SafeImage
                      src={c.imageUrl}
                      alt={c.name}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                    />
                  ) : (
                    initial
                  )}
                </span>
                <Text
                  variant="labelLarge"
                  className="text-center leading-tight line-clamp-2 text-xs font-semibold"
                >
                  {c.name}
                </Text>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
