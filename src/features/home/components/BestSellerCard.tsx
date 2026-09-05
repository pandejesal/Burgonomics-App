import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Minus } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { formatINR } from "@/core/utils/format";
import { HapticService } from "@/core/services/haptics";
import { SafeImage } from "@/shared/components/common/SafeImage";
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
  const line = useCartStore((s) => s.lines.find((l) => l.productId === product.id));
  const qty = line?.quantity ?? 0;
  const [busy, setBusy] = React.useState(false);

  const handleQuickAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy || !store) return;
    setBusy(true);
    void HapticService.impact("medium");
    await cartRepository.addItem({
      storeId: store.id,
      productId: product.id,
      name: product.name,
      unitPrice: product.price,
      quantity: 1,
      veg: product.veg ?? true,
      imageUrl: product.imageUrl,
      fallbackImageUrl: product.fallbackImageUrl,
    });
    setBusy(false);
  };

  const handleIncrement = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy || !line) return;
    setBusy(true);
    void HapticService.impact("light");
    await cartRepository.updateQuantity(line.lineId, line.quantity + 1);
    setBusy(false);
  };

  const handleDecrement = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
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

        {/* 100% Pure Veg Green Badge */}
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-md bg-white/95 px-1.5 py-0.5 shadow-sm backdrop-blur-sm">
          <span className="flex h-3 w-3 items-center justify-center rounded-[2px] border border-emerald-600 p-[1px]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
          </span>
          <span className="text-[9px] font-bold text-emerald-800 tracking-wider">VEG</span>
        </div>

        {hasBestsellerTag && (
          <div className="absolute top-2 right-2 z-10 rounded-full bg-accent px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white shadow-sm">
            Bestseller
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
            {product.description || "100% Pure Veg delicious smash burger"}
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
                  disabled={busy}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  whileTap={{ scale: 0.92 }}
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-full border-2 border-primary bg-primary/5 px-3 text-xs font-bold text-primary hover:bg-primary hover:text-white transition-all duration-200 shadow-sm"
                >
                  <Plus className="h-3.5 w-3.5 stroke-[3px]" />
                  <span>ADD</span>
                </motion.button>
              ) : (
                <motion.div
                  key="stepper"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="flex h-8 items-center rounded-full bg-primary text-white shadow-sm overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={handleDecrement}
                    disabled={busy}
                    className="flex h-full w-7 items-center justify-center hover:bg-black/20 transition-colors"
                  >
                    <Minus className="h-3.5 w-3.5 stroke-[2.5px]" />
                  </button>
                  <span className="w-5 text-center text-xs font-black">{qty}</span>
                  <button
                    type="button"
                    onClick={handleIncrement}
                    disabled={busy}
                    className="flex h-full w-7 items-center justify-center hover:bg-black/20 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5 stroke-[2.5px]" />
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
