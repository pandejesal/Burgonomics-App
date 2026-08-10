import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Clock, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";

import { AppCard } from "@/shared/components/common/AppCard";
import { AppBadge } from "@/shared/components/common/AppBadge";
import { VegIndicator } from "@/shared/components/common/VegIndicator";
import { Text } from "@/shared/components/common/Text";
import { SafeImage } from "@/shared/components/common/SafeImage";
import { formatINR } from "@/core/utils/format";
import { FavoriteHeart } from "@/features/favorites/components/FavoriteHeart";
import type { Product } from "@/features/menu/models";

import { useCartStore } from "@/features/cart/state/cartStore";
import { cartRepository } from "@/features/cart/repositories/CartRepository";
import { HapticService } from "@/core/services/haptics";
import { AudioService } from "@/core/services/audio";

interface Props {
  product: Product;
  layout?: "row" | "grid";
  onAdd?: (p: Product) => void;
  className?: string;
  searchQuery?: string;
}

export function highlightText(text: string, query?: string): React.ReactNode {
  if (!query || !query.trim()) return text;
  const q = query.trim();
  // Safe escape for query characters in regex
  const escapedQuery = q.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const regex = new RegExp(`(${escapedQuery})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-amber-100 text-amber-950 rounded-[2px] px-0.5 font-bold">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

/**
 * MenuProductCard — supports "row" (list) and "grid" layouts, degrades
 * gracefully on missing fields, and renders repository-driven badges.
 * Upgraded with premium inline quantity morphing and haptic confirmation.
 */
export const MenuProductCard = React.memo(function MenuProductCard({
  product,
  layout = "row",
  onAdd,
  className,
  searchQuery,
}: Props) {
  const {
    id,
    name,
    description,
    price,
    compareAtPrice,
    discountPercentage,
    veg,
    imageUrl,
    fallbackImageUrl,
    inStock,
    customizable,
    prepTimeMinutes,
    badges,
    unavailableReason,
  } = product;

  const to = "/menu/product/$productId";
  const disabled = !inStock;

  const [isFlashActive, setIsFlashActive] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  // Reactive subscription to quantity in cart for this specific item (non-customizable)
  const quantity = useCartStore((s) => {
    const line = s.lines.find((l) => l.productId === id && l.modifiers.length === 0);
    return line ? line.quantity : 0;
  });

  const handleQtyAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    HapticService.impact("medium");
    AudioService.playClick();
    setIsFlashActive(true);
    setTimeout(() => setIsFlashActive(false), 800);

    if (customizable) {
      onAdd?.(product);
      return;
    }

    const line = useCartStore
      .getState()
      .lines.find((l) => l.productId === id && l.modifiers.length === 0);
    if (line) {
      await cartRepository.updateQuantity(line.lineId, line.quantity + 1);
    } else {
      onAdd?.(product);
    }
  };

  const handleQtySubtract = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    HapticService.impact("light");
    AudioService.playClick();

    const line = useCartStore
      .getState()
      .lines.find((l) => l.productId === id && l.modifiers.length === 0);
    if (line) {
      await cartRepository.updateQuantity(line.lineId, line.quantity - 1);
    }
  };

  const image = (
    <div
      className={cn(
        "relative overflow-hidden bg-bg-secondary",
        layout === "row"
          ? "h-24 w-24 flex-none rounded-[var(--radius-medium)]"
          : "aspect-square w-full",
      )}
    >
      {imageUrl ? (
        <>
          <div
            className={cn(
              "absolute inset-0 skeleton h-full w-full transition-opacity duration-300",
              loaded ? "opacity-0 pointer-events-none" : "opacity-100",
            )}
            aria-hidden
          />
          <SafeImage
            src={imageUrl}
            fallbackSrc={fallbackImageUrl}
            alt=""
            loading="lazy"
            onLoad={() => setLoaded(true)}
            className={cn(
              "h-full w-full object-cover transition-opacity duration-300",
              loaded ? "opacity-100" : "opacity-0",
            )}
          />
        </>
      ) : (
        <div className="skeleton h-full w-full" aria-hidden />
      )}
      {typeof discountPercentage === "number" && discountPercentage > 0 && (
        <AppBadge tone="primary" className="absolute left-1.5 top-1.5">
          {discountPercentage}% OFF
        </AppBadge>
      )}
      {disabled && (
        <div className="absolute inset-0 grid place-items-center bg-black/55">
          <AppBadge tone="neutral">{unavailableReason ?? "Unavailable"}</AppBadge>
        </div>
      )}
      <FavoriteHeart
        kind="product"
        refId={id}
        name={name}
        imageUrl={imageUrl}
        fallbackImageUrl={fallbackImageUrl}
        priceLabel={formatINR(price)}
        className="absolute right-1.5 top-1.5"
      />
    </div>
  );

  const AddButton = (
    <div
      className="relative min-h-[36px] flex items-center justify-end"
      onClick={(e) => e.stopPropagation()}
    >
      <AnimatePresence mode="wait">
        {quantity > 0 && !customizable ? (
          <motion.div
            key="quantity-controls"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
            className="flex items-center gap-2 bg-primary text-primary-foreground h-9 px-1.5 rounded-full shadow-[var(--shadow-low)]"
          >
            <button
              type="button"
              className="relative before:absolute before:inset-[-8px] before:content-[''] w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/10 active:scale-90 transition font-bold"
              onClick={handleQtySubtract}
              aria-label={`Decrease ${name} quantity`}
            >
              −
            </button>
            <motion.span
              key={quantity}
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="font-bold min-w-[14px] text-center text-sm"
            >
              {quantity}
            </motion.span>
            <button
              type="button"
              className="relative before:absolute before:inset-[-8px] before:content-[''] w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/10 active:scale-90 transition font-bold"
              onClick={handleQtyAdd}
              aria-label={`Increase ${name} quantity`}
            >
              +
            </button>
          </motion.div>
        ) : (
          <motion.button
            key="add-only"
            type="button"
            onClick={handleQtyAdd}
            disabled={disabled}
            aria-label={`Add ${name} to cart`}
            className={cn(
              "min-h-[36px] rounded-full border border-primary px-4 type-label-large text-primary bg-surface",
              "hover:bg-primary/5 active:scale-[0.95] transition duration-150 disabled:opacity-40 whitespace-nowrap shrink-0",
            )}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            {customizable ? "ADD +" : "ADD"}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );

  const meta = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-caption text-text-secondary">
      {typeof prepTimeMinutes === "number" && (
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" aria-hidden /> {prepTimeMinutes} min
        </span>
      )}
      {customizable && (
        <span className="inline-flex items-center gap-1">
          <Settings2 className="h-3.5 w-3.5" aria-hidden /> Customizable
        </span>
      )}
    </div>
  );

  const badgeRow = badges && badges.length > 0 && (
    <div className="mt-1 flex flex-wrap gap-1">
      {badges.map((b) => (
        <AppBadge key={b.id} tone={b.tone ?? "neutral"}>
          {b.label}
        </AppBadge>
      ))}
    </div>
  );

  if (layout === "grid") {
    return (
      <Link to={to} params={{ productId: id }} className={cn("block", className)} aria-label={name}>
        <AppCard
          elevation="low"
          padded={false}
          interactive={true}
          className={cn(
            "overflow-hidden flex h-full flex-col transition-all duration-300",
            isFlashActive && "ring-2 ring-emerald-500/50 bg-emerald-50/5 dark:bg-emerald-950/10",
          )}
        >
          {image}
          <div className="flex flex-1 flex-col min-w-0 gap-1 p-3">
            <div className="flex items-center gap-2 min-w-0">
              <VegIndicator veg={veg} />
              <Text variant="titleMedium" className="truncate">
                {highlightText(name, searchQuery)}
              </Text>
            </div>
            {description && (
              <Text variant="bodyMedium" tone="secondary" className="line-clamp-2">
                {highlightText(description, searchQuery)}
              </Text>
            )}
            {meta}
            {badgeRow}
            <div className="mt-auto flex items-center justify-between pt-2">
              <div className="flex items-baseline gap-2">
                <Text variant="titleLarge">{formatINR(price)}</Text>
                {compareAtPrice && compareAtPrice > price && (
                  <span className="type-caption text-text-secondary line-through">
                    {formatINR(compareAtPrice)}
                  </span>
                )}
              </div>
              {AddButton}
            </div>
          </div>
        </AppCard>
      </Link>
    );
  }

  // row layout
  return (
    <Link to={to} params={{ productId: id }} className={cn("block", className)} aria-label={name}>
      <AppCard
        elevation="low"
        padded={false}
        interactive={true}
        className={cn(
          "flex gap-3 p-3 transition-all duration-300",
          isFlashActive && "ring-2 ring-emerald-500/50 bg-emerald-50/5 dark:bg-emerald-950/10",
        )}
      >
        {image}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2 min-w-0">
            <VegIndicator veg={veg} />
            <Text variant="titleMedium" className="truncate">
              {highlightText(name, searchQuery)}
            </Text>
          </div>
          {description && (
            <Text variant="bodyMedium" tone="secondary" className="line-clamp-2">
              {highlightText(description, searchQuery)}
            </Text>
          )}
          {meta}
          {badgeRow}
          <div className="mt-1 flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <Text variant="titleLarge">{formatINR(price)}</Text>
              {compareAtPrice && compareAtPrice > price && (
                <span className="type-caption text-text-secondary line-through">
                  {formatINR(compareAtPrice)}
                </span>
              )}
            </div>
            {AddButton}
          </div>
        </div>
      </AppCard>
    </Link>
  );
});
