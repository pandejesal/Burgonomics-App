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
 * Fully dynamic category rail. Horizontal scroll-snap chips keep the
 * whole catalog on a single row — zero vertical scroll cost on Home.
 * Categories originate from Petpooja menu synchronization.
 */
export function CategoryGrid({ categories, className }: Props) {
  const navigate = useNavigate();
  const setActiveCategory = useMenuStore((s) => s.setActiveCategory);

  if (categories.length === 0) return null;
  return (
    <nav aria-label="Menu categories" className={cn("px-4", className)}>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 scroll-smooth [touch-action:pan-x_pan-y] no-scrollbar">
        {categories.map((c) => {
          const initial = c.name.trim().charAt(0).toUpperCase() || "•";
          return (
            <li key={c.id} className="shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActiveCategory(c.id);
                  void navigate({ to: "/menu" });
                }}
                aria-label={`Browse ${c.name}, ${c.itemCount} items`}
                className={cn(
                  "group flex w-16 flex-col items-center gap-1.5 rounded-[var(--radius-large)] text-left cursor-pointer",
                  "border border-transparent bg-surface p-2",
                  "hover:border-divider hover:shadow-[var(--shadow-low)]",
                  "transition-all duration-200 active:scale-[0.97]",
                )}
              >
                <span
                  className="relative grid h-12 w-12 overflow-hidden place-items-center rounded-full bg-primary/10 text-primary type-title-large shadow-xs"
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
                  className="w-full text-center leading-tight truncate text-[11px] font-semibold"
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
