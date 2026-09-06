import * as React from "react";
import { Plus, Minus, Sparkles, Clock, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";
import { AudioService } from "@/core/services/audio";
import { useCartStore } from "@/features/cart/state/cartStore";
import { cartRepository } from "@/features/cart/repositories/CartRepository";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { formatINR } from "@/core/utils/format";
import { SafeImage } from "@/shared/components/common/SafeImage";
import type { Product } from "../models";

interface MenuItemCardProps {
  product: Product;
  onProductClick?: (productId: string) => void;
  onCustomizeClick?: (product: Product) => void;
  className?: string;
}

export function MenuItemCard({
  product,
  onProductClick,
  onCustomizeClick,
  className,
}: MenuItemCardProps) {
  const store = useStoreSelection((s) => s.activeStore);
  const isOutOfStock = product.inStock === false;

  // Reactively track cart quantity for non-customized line
  const cartQty = useCartStore((s) => {
    const line = s.lines.find(
      (l) => l.productId === product.id && (!l.modifiers || l.modifiers.length === 0)
    );
    return line ? line.quantity : 0;
  });

  const cartLineId = useCartStore((s) => {
    const line = s.lines.find(
      (l) => l.productId === product.id && (!l.modifiers || l.modifiers.length === 0)
    );
    return line ? line.lineId : null;
  });

  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOutOfStock || !store) return;

    if (product.customizable) {
      void HapticService.impact("light");
      if (onCustomizeClick) {
        onCustomizeClick(product);
      } else if (onProductClick) {
        onProductClick(product.id);
      }
      return;
    }

    void HapticService.impact("medium");
    AudioService.playClick();
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
  };

  const handleIncrement = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOutOfStock) return;
    void HapticService.impact("light");
    AudioService.playClick();

    if (cartLineId) {
      await cartRepository.updateQuantity(cartLineId, cartQty + 1);
    } else if (store) {
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
    }
  };

  const handleDecrement = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cartLineId) return;
    void HapticService.impact("light");
    AudioService.playClick();
    await cartRepository.updateQuantity(cartLineId, cartQty - 1);
  };

  return (
    <div
      onClick={() => onProductClick?.(product.id)}
      className={cn(
        "relative flex items-stretch justify-between gap-4 p-4 rounded-2xl bg-surface border border-divider transition-all shadow-xs select-none group cursor-pointer",
        isOutOfStock ? "opacity-60 bg-bg-secondary/60 cursor-not-allowed" : "hover:border-primary/40",
        className
      )}
    >
      {/* Left Details Column */}
      <div className="flex-1 flex flex-col justify-between space-y-2 min-w-0">
        <div>
          {/* Top Row: Pure Veg Symbol & Badges */}
          <div className="flex items-center gap-2 mb-1.5">
            {/* 100% Pure Veg Green Dot Box */}
            <div
              className="w-4 h-4 rounded-[3px] border-2 border-emerald-600 bg-emerald-950/20 flex items-center justify-center shrink-0"
              aria-label="100% Pure Vegetarian"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
            </div>

            {product.badges && product.badges.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[#0E4825] text-[#4ADE80] text-[10px] font-black uppercase tracking-wider border border-[#4ADE80]/30 shadow-xs flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                <span>{product.badges[0].label}</span>
              </span>
            )}

            {typeof product.prepTimeMinutes === "number" && (
              <span className="inline-flex items-center gap-1 text-[11px] text-text-secondary font-mono">
                <Clock className="w-3 h-3" />
                <span>{product.prepTimeMinutes}m</span>
              </span>
            )}
          </div>

          {/* Product Title */}
          <h3 className="text-sm font-bold text-text group-hover:text-primary transition-colors line-clamp-1">
            {product.name}
          </h3>

          {/* Customizable Tag */}
          {product.customizable && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary mt-0.5">
              <Settings2 className="w-3 h-3" />
              <span>Customisable</span>
            </span>
          )}

          {/* Description */}
          {product.description && (
            <p className="text-xs text-text-secondary line-clamp-2 mt-1 leading-relaxed">
              {product.description}
            </p>
          )}
        </div>

        {/* Price Row */}
        <div className="pt-1 flex items-baseline gap-2">
          <span className="text-sm font-black font-mono text-text">
            {formatINR(product.price)}
          </span>
          {product.compareAtPrice && product.compareAtPrice > product.price && (
            <span className="text-xs text-text-secondary line-through font-mono">
              {formatINR(product.compareAtPrice)}
            </span>
          )}
        </div>
      </div>

      {/* Right Image & Add/Stepper Column */}
      <div className="relative w-28 h-28 sm:w-32 sm:h-32 shrink-0 flex flex-col items-center justify-end">
        {/* Product Image */}
        <div className="absolute inset-0 rounded-xl overflow-hidden bg-bg-secondary border border-divider">
          {product.imageUrl ? (
            <SafeImage
              src={product.imageUrl}
              fallbackSrc={product.fallbackImageUrl}
              alt={product.name}
              loading="lazy"
              decoding="async"
              className={cn(
                "w-full h-full object-cover transition-transform duration-300",
                !isOutOfStock && "group-hover:scale-105"
              )}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-3xl bg-surface">
              🍔
            </div>
          )}
        </div>

        {/* Sold Out Badge or 1-Tap ADD / Stepper Button */}
        <div className="relative z-10 -mb-2" onClick={(e) => e.stopPropagation()}>
          {isOutOfStock ? (
            <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-400 text-xs font-bold uppercase tracking-wider shadow-sm">
              Sold Out
            </span>
          ) : cartQty > 0 && !product.customizable ? (
            /* Morphing Stepper Button with 48x48 touch targets */
            <div className="flex items-center bg-[#FF6600] text-white rounded-xl shadow-md overflow-hidden border border-white/20">
              <button
                type="button"
                onClick={handleDecrement}
                aria-label={`Decrease quantity of ${product.name}`}
                className="w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center hover:bg-black/20 active:scale-90 transition-all cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>

              <span className="w-7 text-center text-xs font-black font-mono">
                {cartQty}
              </span>

              <button
                type="button"
                onClick={handleIncrement}
                aria-label={`Increase quantity of ${product.name}`}
                className="w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center hover:bg-black/20 active:scale-90 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* 1-Tap Add Button */
            <button
              type="button"
              onClick={handleAdd}
              aria-label={`Add ${product.name} to cart`}
              className="flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-surface hover:bg-[#FF6600] text-[#FF6600] hover:text-white border-2 border-[#FF6600] text-xs font-black uppercase tracking-wider shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <span>{product.customizable ? "ADD +" : "ADD"}</span>
              {!product.customizable && <Plus className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default MenuItemCard;
