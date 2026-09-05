import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { AppCard } from "@/shared/components/common/AppCard";
import { AppBadge } from "@/shared/components/common/AppBadge";
import { Text } from "@/shared/components/common/Text";
import { formatINR } from "@/core/utils/format";
import { SafeImage } from "@/shared/components/common/SafeImage";
import type { Combo } from "@/features/home/models";

interface Props {
  combo: Combo;
  className?: string;
}

export function ComboCard({ combo, className }: Props) {
  const navigate = useNavigate();
  const savings = Math.max(0, combo.originalPrice - combo.price);
  const savingsPct = combo.originalPrice ? Math.round((savings / combo.originalPrice) * 100) : 0;

  const handleClick = () => {
    if (combo.id && combo.id.startsWith("prd_")) {
      void navigate({ to: "/menu/product/$productId", params: { productId: combo.id } });
    } else {
      void navigate({ to: "/menu" });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`${combo.name}, ${combo.description}, ${formatINR(combo.price)}, save ${formatINR(savings)}`}
      className="block text-left cursor-pointer"
    >
      <AppCard
        elevation="low"
        padded={false}
        className={cn(
          "w-[240px] overflow-hidden transition-transform duration-200 active:scale-[0.98]",
          className,
        )}
      >
        <div
          className={cn(
            "relative h-32 bg-gradient-to-br overflow-hidden bg-bg-secondary",
            !combo.imageUrl && "grid place-items-center text-5xl",
            !combo.imageUrl && combo.gradient,
          )}
          aria-hidden
        >
          {savingsPct > 0 && (
            <AppBadge tone="success" className="absolute left-2 top-2 z-10 font-bold shadow-xs">
              Save {savingsPct}%
            </AppBadge>
          )}
          {combo.imageUrl ? (
            <SafeImage
              src={combo.imageUrl}
              fallbackSrc={combo.fallbackImageUrl}
              alt={combo.name}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
            />
          ) : combo.visual ? (
            <span>{combo.visual}</span>
          ) : (
            <span className="text-[11px] font-bold text-white/80 uppercase tracking-wider">Burgonomics</span>
          )}
        </div>
        <div className="p-3 bg-surface">
          <Text variant="titleMedium" className="truncate font-bold">
            {combo.name}
          </Text>
          <Text variant="bodyMedium" tone="secondary" className="line-clamp-2 text-xs">
            {combo.description}
          </Text>
          <div className="mt-2 flex items-baseline gap-2">
            <Text variant="headlineMedium" className="text-primary tracking-wide">
              {formatINR(combo.price)}
            </Text>
            {savings > 0 && (
              <span className="type-caption text-text-disabled line-through">
                {formatINR(combo.originalPrice)}
              </span>
            )}
          </div>
        </div>
      </AppCard>
    </button>
  );
}
