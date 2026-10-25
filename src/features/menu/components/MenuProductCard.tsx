import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Clock, Settings2, Plus, Minus } from "lucide-react";
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
  const escapedQuery = q.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const regex = new RegExp(`(${escapedQuery})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark
            key={i}
            className="bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 rounded-[2px] px-0.5 font-bold"
          >
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
 * MT-04 — Distinctive overlay badge drawn over the bottom-left of the
 * product image. Explicit repository badges win, then curated series
 * matches ("Big Bang", "Sizzling"), then the first product tag.
 */
export function getDistinctiveOverlayBadge(product: Product): {
  label: string;
  tone: "orange" | "emerald" | "amber" | "neutral";
} | null {
  if (product.badges && product.badges.length > 0) {
    const b = product.badges[0];
    const tone =
      b.tone === "primary" ? "orange" : b.tone === "success" ? "emerald" : b.tone === "warning" ? "amber" : "orange";
    return { label: b.label, tone };
  }
  const lowerName = (product.name || "").toLowerCase();
  const lowerCat = (product.categoryName || "").toLowerCase();
  if (lowerName.includes("big bang") || lowerCat.includes("big bang")) {
    return { label: "Big Bang Series", tone: "orange" };
  }
  if (lowerName.includes("sizzling") || lowerCat.includes("sizzling")) {
    return { label: "Sizzling Hot", tone: "amber" };
  }
  if (product.tags && product.tags.length > 0) {
    return { label: product.tags[0], tone: "neutral" };
  }
  return null;
}

/**
 * MenuProductCard — supports "row" (list) and "grid" layouts, degrades
 * gracefully on missing fields, and renders repository-driven badges.
 * Upgraded with premium inline quantity morphing, 48px touch targets, and haptic confirmation.
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
  const disabled = inStock === false;

  const [isFlashActive, setIsFlashActive] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  // Reactive subscription to quantity in cart for this specific item (non-customizable)
  const quantity = useCartStore((s) => {
    const line = s.lines.find((l) => l.productId === id && (!l.modifiers || l.modifiers.length === 0));
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
      .lines.find((l) => l.productId === id && (!l.modifiers || l.modifiers.length === 0));
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
      .lines.find((l) => l.productId === id && (!l.modifiers || l.modifiers.length === 0));
    if (line) {
      await cartRepository.updateQuantity(line.lineId, line.quantity - 1);
    }
  };

  // MT-04: series/explicit badge overlaid on the product image.
  const distinctiveBadge = getDistinctiveOverlayBadge(product);

  // B04: the card link's accessible name must carry the full title and the
  // price. `aria-label` replaces the link's content for the name computation,
  // so a label of just `name` would hide price/sold-out from assistive tech —
  // the clamped description stays in the DOM for browse mode either way.
  const linkAriaLabel = `${name}, ${formatINR(price)}${disabled ? ", sold out" : ""}`;

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
        <div className="absolute inset-0 grid place-items-center bg-black/65 backdrop-blur-[1px]">
          <span className="px-2 py-1 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-300 text-[10px] font-black uppercase tracking-wider shadow-sm">
            {unavailableReason ?? "Sold Out"}
          </span>
        </div>
      )}
      {distinctiveBadge && (
        <span
          data-testid="product-image-badge"
          className={cn(
            "absolute bottom-1.5 left-1.5 z-10 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider shadow-md backdrop-blur-xs border",
            distinctiveBadge.tone === "orange" &&
              "bg-accent dark:bg-[var(--accent-hover)] text-accent-foreground border-accent/40",
            distinctiveBadge.tone === "emerald" && "bg-[#0E4825]/90 text-emerald-300 border-emerald-500/40",
            distinctiveBadge.tone === "amber" && "bg-amber-600/90 text-white border-amber-500/40",
            distinctiveBadge.tone === "neutral" && "bg-neutral-900/90 text-neutral-200 border-neutral-700/60",
          )}
        >
          {distinctiveBadge.label}
        </span>
      )}
      <FavoriteHeart
        kind="product"
        refId={id}
        name={name}
        imageUrl={imageUrl}
        fallbackImageUrl={fallbackImageUrl}
        priceLabel={formatINR(price)}
        // The heart button is a 44px hit target with the 36px disc centred
        // inside it, so the disc is anchored 4px in from the button edge:
        // right-0.5/top-0.5 puts it exactly where right-1.5/top-1.5 used to.
        className="absolute right-0.5 top-0.5"
      />
    </div>
  );

  // R26 contrast: the ADD control uses the semantic accent pair instead of the
  // legacy #FF6600 (white-on-#FF6600 / #FF6600-on-surface were both 2.94:1).
  // Light rests as accent text+border on --surface (5.18:1) and fills on hover
  // (accent bg + accent-foreground, 5.18:1). Dark cannot use accent text on
  // --surface (only 3.96:1), so it rests as accent-foreground label (17.4:1)
  // behind the accent border (3.96:1 >= 3:1) and fills with --accent-hover,
  // the one accent shade that carries white text at >= 4.5:1 (5.50:1).
  const AddButton = (
    <div
      className={cn(
        // Both layouts hold a 44px row: ADD and the in-cart stepper share one
        // floor, so the price row never changes height when quantity flips.
        // ml-auto keeps the control hard-right after a flex-wrap break — the
        // price row wraps rather than overflowing horizontally at 320px
        // (SC 1.4.10 reflow).
        "relative flex items-center justify-end shrink-0 overflow-hidden min-h-[44px] ml-auto",
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <AnimatePresence mode="wait">
        {quantity > 0 && !disabled && !customizable ? (
          <motion.div
            key="quantity-controls"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
            // B04 stepper sizing: row +/- reach the 44px touch aim (SC 2.5.5)
            // — 44+44+16 qty+12 px-1.5+8 gaps+2 border = 126px, which fits the
            // 156px row content column at 390px and wraps below. Grid +/- go
            // 24 -> 32 (SC 2.5.8 floor is 24, so this is above the floor with
            // room to spare); a 44px grid stepper measures ~116px against
            // ~117px of content at 320px, which is an overflow risk, so the
            // price row wraps instead.
            className={cn(
              "flex items-center bg-accent dark:bg-[var(--accent-hover)] text-accent-foreground rounded-lg shadow-md border border-white/20 shrink-0 overflow-hidden",
              layout === "grid" ? "h-8 px-1 gap-0.5" : "h-11 px-1.5 gap-1",
            )}
          >
            <button
              type="button"
              className={cn(
                "relative flex items-center justify-center rounded-md hover:bg-black/20 active:scale-90 transition font-bold cursor-pointer shrink-0",
                layout === "grid" ? "w-8 h-8 min-h-[32px] min-w-[32px]" : "w-11 h-11 min-h-[44px] min-w-[44px]",
              )}
              onClick={handleQtySubtract}
              aria-label={`Decrease quantity of ${name}`}
            >
              <Minus className={layout === "grid" ? "w-3.5 h-3.5" : "w-4 h-4"} />
            </button>
            <motion.span
              key={quantity}
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={cn(
                "font-bold text-center font-mono",
                layout === "grid" ? "min-w-[14px] text-[11px] px-0.5" : "min-w-[16px] text-xs px-0.5",
              )}
            >
              {quantity}
            </motion.span>
            <button
              type="button"
              className={cn(
                "relative flex items-center justify-center rounded-md hover:bg-black/20 active:scale-90 transition font-bold cursor-pointer shrink-0",
                layout === "grid" ? "w-8 h-8 min-h-[32px] min-w-[32px]" : "w-11 h-11 min-h-[44px] min-w-[44px]",
              )}
              onClick={handleQtyAdd}
              aria-label={`Increase quantity of ${name}`}
            >
              <Plus className={layout === "grid" ? "w-3.5 h-3.5" : "w-4 h-4"} />
            </button>
          </motion.div>
        ) : (
          <motion.button
            key="add-only"
            type="button"
            onClick={handleQtyAdd}
            disabled={disabled}
            // A disabled control must not advertise an action it cannot do:
            // when sold out the name states the state instead of the verb.
            aria-label={disabled ? `${name} is sold out` : `Add ${name} to cart`}
            className={cn(
              "rounded-xl border-2 border-accent font-black text-accent dark:text-accent-foreground bg-surface",
              // Grid ADD raised 32 -> 44px touch floor; the 4px of body
              // padding comes back out so the card keeps its compact height.
              layout === "grid" ? "min-h-[44px] min-w-[50px] px-2.5 text-xs" : "min-h-[44px] min-w-[72px] px-4 type-label-large",
              "hover:bg-accent hover:text-accent-foreground dark:hover:bg-[var(--accent-hover)] active:scale-[0.95] transition duration-150 disabled:opacity-40 disabled:hover:bg-surface disabled:hover:text-accent whitespace-nowrap shrink-0 cursor-pointer shadow-xs",
            )}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            {disabled ? "Sold Out" : customizable ? "ADD +" : "ADD"}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );

  const meta = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-caption text-text-secondary">
      {typeof prepTimeMinutes === "number" && prepTimeMinutes > 0 && (
        <span className="inline-flex items-center gap-1 font-mono text-[11px]">
          <Clock className="h-3.5 w-3.5" aria-hidden /> {prepTimeMinutes}m
        </span>
      )}
      {customizable && (
        <span className="inline-flex items-center gap-1 text-primary font-semibold text-[11px]">
          <Settings2 className="h-3.5 w-3.5" aria-hidden /> Customisable
        </span>
      )}
    </div>
  );

  const badgeRow = badges && badges.length > 0 && (
    <div className="mt-1 flex flex-wrap gap-1">
      {badges.map((b) => (
        <span
          key={b.id}
          className="px-2 py-0.5 rounded-full bg-[#0E4825] text-[#4ADE80] text-[9px] font-black uppercase tracking-wider border border-[#4ADE80]/30 shadow-xs"
        >
          {b.label}
        </span>
      ))}
    </div>
  );

  if (layout === "grid") {
    return (
      <Link
        to={to}
        params={{ productId: id }}
        className={cn(
          "block select-none transition-transform duration-150 ease-out active:scale-[0.97] active:opacity-80",
          disabled && "opacity-60",
          className,
        )}
        aria-label={linkAriaLabel}
      >
        <AppCard
          elevation="low"
          padded={false}
          interactive={false}
          className={cn(
            "overflow-hidden flex h-full flex-col transition-all duration-300 rounded-2xl border border-divider",
            isFlashActive && "ring-2 ring-emerald-500/50 bg-emerald-50/5 dark:bg-emerald-950/10",
          )}
        >
          {image}
          <div className="flex flex-1 flex-col min-w-0 gap-1 p-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <VegIndicator veg={veg ?? true} />
              <Text variant="titleMedium" className="truncate" title={name}>
                {highlightText(name, searchQuery)}
              </Text>
            </div>
            {description && (
              <Text variant="bodyMedium" tone="secondary" className="line-clamp-2 text-xs">
                {highlightText(description, searchQuery)}
              </Text>
            )}
            {meta}
            {badgeRow}
            <div className="mt-auto flex flex-wrap items-center justify-between pt-2 gap-x-2 gap-y-1">
              <div className="flex items-baseline gap-1 shrink-0">
                <Text variant="titleMedium" className="font-mono font-black truncate">{formatINR(price)}</Text>
                {compareAtPrice && compareAtPrice > price && (
                  <span className="type-caption text-text-secondary line-through font-mono text-[10px] truncate">
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
    <Link
      to={to}
      params={{ productId: id }}
      className={cn(
        "block select-none transition-transform duration-150 ease-out active:scale-[0.97] active:opacity-80",
        disabled && "opacity-60",
        className,
      )}
      aria-label={linkAriaLabel}
    >
      <AppCard
        elevation="low"
        padded={false}
        interactive={false}
        className={cn(
          "flex gap-3 p-3 transition-all duration-300 rounded-2xl border border-divider",
          isFlashActive && "ring-2 ring-emerald-500/50 bg-emerald-50/5 dark:bg-emerald-950/10",
        )}
      >
        {image}
        <div className="flex min-w-0 flex-1 flex-col gap-1 justify-between">
          <div>
            <div className="flex items-center gap-2 min-w-0">
              <VegIndicator veg={veg ?? true} />
              <Text variant="titleMedium" className="truncate font-bold" title={name}>
                {highlightText(name, searchQuery)}
              </Text>
            </div>
            {description && (
              <Text variant="bodyMedium" tone="secondary" className="line-clamp-2 text-xs">
                {highlightText(description, searchQuery)}
              </Text>
            )}
            {meta}
            {badgeRow}
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <div className="flex items-baseline gap-2 shrink-0">
              <Text variant="titleLarge" className="font-mono font-black">{formatINR(price)}</Text>
              {compareAtPrice && compareAtPrice > price && (
                <span className="type-caption text-text-secondary line-through font-mono">
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

export default MenuProductCard;
