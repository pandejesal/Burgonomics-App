import * as React from "react";
import { AppCard } from "./AppCard";
import { AppBadge } from "./AppBadge";
import { VegIndicator } from "./VegIndicator";
import { Text } from "./Text";
import { SafeImage } from "./SafeImage";
import { formatINR } from "@/core/utils/format";
import { cn } from "@/lib/utils";

export interface ProductCardProps {
  id: string;
  name: string;
  description?: string;
  price: number;
  discountPercentage?: number;
  veg?: boolean;
  imageUrl?: string;
  fallbackImageUrl?: string;
  inStock?: boolean;
  onAdd?: (id: string) => void;
  onClickCard?: (id: string) => void;
  className?: string;
}

export function ProductCard({
  id,
  name,
  description,
  price,
  discountPercentage,
  veg,
  imageUrl,
  fallbackImageUrl,
  inStock = true,
  onAdd,
  onClickCard,
  className,
}: ProductCardProps) {
  return (
    <AppCard
      elevation="low"
      padded={false}
      interactive={true}
      onClick={() => onClickCard?.(id)}
      className={cn(
        "group flex flex-col overflow-hidden cursor-pointer float-interactive",
        className,
      )}
      aria-label={`${name}, ${formatINR(price)}`}
    >
      <div className="relative aspect-square bg-bg-secondary overflow-hidden">
        {imageUrl ? (
          <SafeImage
            src={imageUrl}
            fallbackSrc={fallbackImageUrl}
            alt={name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="skeleton h-full w-full" aria-hidden />
        )}
        {typeof discountPercentage === "number" && discountPercentage > 0 && (
          <AppBadge tone="warning" className="absolute left-2.5 top-2.5 shadow-sm">
            {discountPercentage}% off
          </AppBadge>
        )}
        {!inStock && (
          <div className="absolute inset-0 grid place-items-center bg-black/40 backdrop-blur-xs">
            <AppBadge tone="neutral" className="font-bold">
              Out of stock
            </AppBadge>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col min-w-0 gap-1.5 p-4 bg-surface">
        <div className="flex items-center gap-2 min-w-0">
          {typeof veg === "boolean" && <VegIndicator veg={veg} />}
          <Text variant="titleMedium" className="font-semibold text-text-primary">
            {name}
          </Text>
        </div>
        {description && (
          <Text
            variant="bodyMedium"
            tone="secondary"
            className="line-clamp-2 text-sm leading-relaxed"
          >
            {description}
          </Text>
        )}
        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          <Text variant="headlineMedium" className="text-primary-text tabular-nums">
            {formatINR(price)}
          </Text>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAdd?.(id);
            }}
            disabled={!inStock}
            aria-label={`Add ${name} to cart`}
            className="min-h-11 min-w-[76px] rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover active:scale-95 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>
    </AppCard>
  );
}
