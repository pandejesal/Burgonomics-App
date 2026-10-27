import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Minus } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { formatINR } from "@/core/utils/format";
import { HapticService } from "@/core/services/haptics";
import { SafeImage } from "@/shared/components/common/SafeImage";
import { VegIndicator } from "@/shared/components/common/VegIndicator";
import { useCartStore } from "@/features/cart/state/cartStore";
import { cartRepository } from "@/features/cart/repositories/CartRepository";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import type { Product } from "@/features/menu/models";

interface BestSellerCardProps {
  product: Product;
  className?: string;
  onCardClick?: () => void;
}

export function BestSellerCard({ product, className, onCardClick }: BestSellerCardProps) {
  const store = useStoreSelection((s) => s.activeStore);
  const lines = useCartStore((s) => s.lines);
  // The same product can sit in the cart as several lines (one per modifier
  // combination), so the stepper shows the sum across them — the first match
  // alone under-reports. The stepper still mutates a single line.
  const matchingLines = React.useMemo(
    () => lines.filter((l) => l.productId === product.id),
    [lines, product.id],
  );
  const line = matchingLines[0];
  const qty = matchingLines.reduce((sum, l) => sum + l.quantity, 0);
  const [busy, setBusy] = React.useState(false);
  // 86ed products can still be rendered here from a cached/real-time fetch —
  // the card must refuse to add them, exactly like MenuProductCard does.
  const isOutOfStock = product.inStock === false;

  const handleQuickAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy || isOutOfStock || !store) return;
    setBusy(true);
    void HapticService.impact("medium");
    await cartRepository.addItem({
      storeId: store.id,
      productId: product.id,
      name: product.name,
      unitPrice: product.price,
      quantity: 1,
      veg: product.veg,
      imageUrl: product.imageUrl,
      fallbackImageUrl: product.fallbackImageUrl,
    });
    setBusy(false);
  };

  const handleIncrement = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy || isOutOfStock || !line) return;
    setBusy(true);
    void HapticService.impact("light");
    await cartRepository.updateQuantity(line.lineId, Math.min(99, line.quantity + 1));
    setBusy(false);
  };

  const handleDecrement = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Removal stays available on an 86ed line — the customer must still be
    // able to take it back out of the basket.
    if (busy || !line) return;
    setBusy(true);
    void HapticService.impact("light");
    if (line.quantity <= 1) {
      await cartRepository.removeItem(line.lineId);
    } else {
      await cartRepository.updateQuantity(line.lineId, line.quantity - 1);
    }
    setBusy(false);
  };

  const hasBestsellerTag = product.badges?.some((b) => b.label.toLowerCase().includes("bestseller")) || product.tags?.includes("popular");

  return (
    <div
      className={cn(
        "relative flex w-[210px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-low transition-all duration-200 hover:shadow-medium",
        className,
      )}
    >
      {/* Product Image & Veg Badge */}
      <Link
        to="/menu/product/$productId"
        params={{ productId: product.id }}
        onClick={(e) => {
          if (onCardClick) {
            e.preventDefault();
            onCardClick();
          }
        }}
        className="group relative block aspect-[4/3] w-full overflow-hidden bg-bg-secondary"
      >
        <SafeImage
          src={product.imageUrl}
          fallbackSrc={product.fallbackImageUrl}
          alt={product.name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />

        {typeof product.veg === "boolean" && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 shadow-sm backdrop-blur-sm">
            <VegIndicator veg={product.veg} />
            <span className="text-[9px] font-bold text-text-primary tracking-wider">
              {product.veg ? "VEG" : "NON-VEG"}
            </span>
          </div>
        )}

        {hasBestsellerTag && (
          <div className="absolute top-2 right-2 z-10 rounded-full bg-accent px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white shadow-sm">
            Bestseller
          </div>
        )}

        {isOutOfStock && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-black/65 backdrop-blur-[1px]">
            <span className="px-2 py-1 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-300 text-[10px] font-black uppercase tracking-wider shadow-sm">
              {product.unavailableReason ?? "Sold Out"}
            </span>
          </div>
        )}
      </Link>

      {/* Card Body */}
      <div className="flex flex-1 flex-col justify-between p-3">
        <div>
          <Link
            to="/menu/product/$productId"
            params={{ productId: product.id }}
            onClick={(e) => {
              if (onCardClick) {
                e.preventDefault();
                onCardClick();
              }
            }}
            className="block"
          >
            <h3 className="line-clamp-1 font-sans text-sm font-bold text-text-primary hover:text-primary transition-colors">
              {product.name}
            </h3>
          </Link>
          <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary">
            {product.description}
          </p>
        </div>

        {/* Price & Action Row */}
        <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-border/60">
          <div className="flex flex-col">
            <span className="text-[10px] font-medium text-text-secondary uppercase">Price</span>
            <span className="font-sans text-sm font-extrabold text-text-primary">
              {formatINR(product.price)}
            </span>
          </div>

          {/* 1-Tap Quick Add / Quantity Stepper */}
          <div className="shrink-0">
            <AnimatePresence mode="wait">
              {qty === 0 ? (
                <motion.button
                  key="add-btn"
                  type="button"
                  onClick={handleQuickAdd}
                  disabled={busy || isOutOfStock}
                  aria-label={
                    isOutOfStock
                      ? `${product.name} is sold out`
                      : `Add ${product.name} to cart`
                  }
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  whileTap={{ scale: 0.92 }}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-full border-2 border-primary bg-primary/5 px-3 text-xs font-bold text-primary hover:bg-primary hover:text-white transition-all duration-200 shadow-sm disabled:opacity-40 disabled:hover:bg-primary/5 disabled:hover:text-primary"
                >
                  <Plus className="h-3.5 w-3.5 stroke-[3px]" aria-hidden />
                  <span>{isOutOfStock ? "Sold Out" : "ADD"}</span>
                </motion.button>
              ) : (
                <motion.div
                  key="stepper"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="flex h-11 min-h-[44px] shrink-0 items-center rounded-full bg-primary text-white shadow-sm overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={handleDecrement}
                    disabled={busy}
                    aria-label={
                      qty <= 1
                        ? `Remove ${product.name} from cart`
                        : `Decrease quantity of ${product.name}`
                    }
                    className="flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 items-center justify-center hover:bg-black/20 transition-colors"
                  >
                    <Minus className="h-3.5 w-3.5 stroke-[2.5px]" aria-hidden />
                  </button>
                  <span className="w-6 min-w-6 shrink-0 text-center text-xs font-black tabular-nums">{qty}</span>
                  <button
                    type="button"
                    onClick={handleIncrement}
                    disabled={busy || isOutOfStock || qty >= 99}
                    aria-label={`Increase quantity of ${product.name}`}
                    className="flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 items-center justify-center hover:bg-black/20 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5 stroke-[2.5px]" aria-hidden />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
