import * as React from "react";
import { Plus, Sparkles, Flame, Check } from "lucide-react";
import { SafeImage } from "@/shared/components/common/SafeImage";
import type { Product } from "@/features/menu/models";
import { cartRepository } from "@/features/cart/repositories/CartRepository";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";

interface BestsellerCarouselProps {
  products: Product[];
  onProductClick?: (productId: string) => void;
  className?: string;
}

export function BestsellerCarousel({
  products,
  onProductClick,
  className,
}: BestsellerCarouselProps) {
  const activeStore = useStoreSelection((s) => s.activeStore);
  const [addedId, setAddedId] = React.useState<string | null>(null);

  const handleQuickAdd = async (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    void HapticService.impact("medium");

    if (!activeStore) {
      toast.error("Please select a store first");
      return;
    }

    await cartRepository.addItem({
      storeId: activeStore.id,
      productId: product.id,
      name: product.name,
      unitPrice: product.price,
      quantity: 1,
      veg: product.veg ?? true,
      imageUrl: product.imageUrl,
      fallbackImageUrl: product.fallbackImageUrl,
    });

    setAddedId(product.id);
    toast.success(`Added ${product.name} to cart`);
    setTimeout(() => setAddedId(null), 1500);
  };

  if (!products || products.length === 0) return null;

  return (
    <div className={cn("w-full space-y-3", className)}>
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[#FF6600]/10 flex items-center justify-center">
            <Flame className="w-3.5 h-3.5 text-[#FF6600]" />
          </div>
          <h2 className="text-sm font-black text-text tracking-tight uppercase">
            Signature Bestsellers
          </h2>
        </div>
        <span className="text-[11px] font-bold text-primary font-mono">100% Pure Veg</span>
      </div>

      <div className="w-full overflow-x-auto no-scrollbar flex gap-3.5 pb-2 snap-x select-none">
        {products.map((product) => (
          <div
            key={product.id}
            onClick={() => onProductClick?.(product.id)}
            className="w-[200px] sm:w-[220px] shrink-0 snap-start bg-surface rounded-2xl border border-divider overflow-hidden flex flex-col justify-between shadow-xs hover:border-primary/50 transition-all cursor-pointer group"
          >
            {/* Product Image / Visual Placeholder */}
            <div className="relative w-full h-28 bg-gradient-to-br from-bg-secondary to-surface flex items-center justify-center overflow-hidden">
              {product.imageUrl ? (
                <SafeImage
                  src={product.imageUrl}
                  fallbackSrc={product.fallbackImageUrl}
                  alt={product.name}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Burgonomics</div>
              )}

              {/* Veg Indicator Badge */}
              <div className="absolute top-2 left-2 w-4 h-4 rounded-sm border-2 border-emerald-500 bg-emerald-950/60 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </div>

              {product.badges && product.badges.length > 0 && (
                <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-[#0E4825] text-[#4ADE80] text-[9px] font-black uppercase tracking-wider border border-[#4ADE80]/30 shadow-xs flex items-center gap-0.5">
                  <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                  <span>{product.badges[0].label}</span>
                </div>
              )}
            </div>

            {/* Content & Details */}
            <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-text line-clamp-1 group-hover:text-primary transition-colors">
                  {product.name}
                </h3>
                <p className="text-[11px] text-text-secondary line-clamp-2 mt-0.5 leading-relaxed">
                  {product.description}
                </p>
              </div>

              {/* Bottom Price & Quick Add */}
              <div className="flex items-center justify-between pt-1 border-t border-divider/60">
                <span className="text-xs font-bold font-mono text-text">
                  ₹{product.price}
                </span>

                <button
                  type="button"
                  onClick={(e) => void handleQuickAdd(e, product)}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer",
                    addedId === product.id
                      ? "bg-emerald-600 text-white"
                      : "bg-[#FF6600] hover:bg-[#e05a00] text-white"
                  )}
                >
                  {addedId === product.id ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Added</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default BestsellerCarousel;
