import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Plus, Minus } from "lucide-react";
import { toast } from "sonner";
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
  const navigate = useNavigate();
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
    if (product.customizable) {
      if (onCardClick) onCardClick();
      else void navigate({ to: "/menu/product/$productId", params: { productId: product.id } });
      return;
    }
    setBusy(true);
    void HapticService.impact("medium");
    try {
      const result = await cartRepository.addItem({
        storeId: store.id,
        productId: product.id,
        name: product.name,
        unitPrice: product.price,
        quantity: 1,
        veg: product.veg,
        imageUrl: product.imageUrl,
        fallbackImageUrl: product.fallbackImageUrl,
      });
      if (!result.success) toast.error(`Couldn't add ${product.name}. Please try again.`);
    } catch {
      toast.error(`Couldn't add ${product.name}. Please try again.`);
    } finally {
      setBusy(false);
    }
  };

  const handleIncrement = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy || isOutOfStock || !line) return;
    setBusy(true);
    void HapticService.impact("light");
    try {
      const result = await cartRepository.updateQuantity(
        line.lineId,
        Math.min(99, line.quantity + 1),
      );
      if (!result.success) toast.error("Couldn't update your cart. Please try again.");
    } catch {
      toast.error("Couldn't update your cart. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleDecrement = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Removal stays available on an 86ed line — the customer must still be
    // able to take it back out of the basket.
    if (busy || !line) return;
    setBusy(true);
    void HapticService.impact("light");
    try {
      const result =
        line.quantity <= 1
          ? await cartRepository.removeItem(line.lineId)
          : await cartRepository.updateQuantity(line.lineId, line.quantity - 1);
      if (!result.success) toast.error("Couldn't update your cart. Please try again.");
    } catch {
      toast.error("Couldn't update your cart. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const hasBestsellerTag =
    product.badges?.some((b) => b.label.toLowerCase().includes("bestseller")) ||
    product.tags?.includes("popular");

  return (
    <div
      className={cn(
        "relative flex h-full w-[200px] max-w-[calc(100vw-2rem)] shrink-0 flex-col",
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
        className="relative block aspect-square w-full overflow-hidden rounded-xl bg-bg-secondary focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring"
      >
        <SafeImage
          src={product.imageUrl}
          fallbackSrc={product.fallbackImageUrl}
          alt={product.name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />

        {typeof product.veg === "boolean" && (
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-md bg-surface px-2 py-1">
            <VegIndicator veg={product.veg} />
            <span className="text-sm font-medium text-text-primary">
              {product.veg ? "Veg" : "Non-veg"}
            </span>
          </div>
        )}

        {hasBestsellerTag && (
          <div className="absolute top-3 right-3 z-10 rounded-md bg-accent px-2 py-1 text-sm font-medium text-accent-foreground">
            Bestseller
          </div>
        )}

        {isOutOfStock && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-surface/90 p-4">
            <span className="rounded-md border border-divider bg-surface px-3 py-2 text-center text-sm font-semibold text-text-primary">
              {product.unavailableReason ?? "Sold out"}
            </span>
          </div>
        )}
      </Link>

      {/* Card Body */}
      <div className="flex flex-1 flex-col justify-between pt-3">
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
            className="block rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <h3 className="font-sans text-base font-semibold leading-snug text-text-primary break-words hover:text-primary-text">
              {product.name}
            </h3>
          </Link>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">{product.description}</p>
        </div>

        {/* Price & Action Row */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="font-sans text-base font-semibold text-text-primary">
              {formatINR(product.price)}
            </span>
          </div>

          {/* 1-Tap Quick Add / Quantity Stepper */}
          <div className="shrink-0">
            {qty === 0 ? (
              <button
                type="button"
                onClick={handleQuickAdd}
                disabled={busy || isOutOfStock}
                aria-label={
                  isOutOfStock
                    ? `${product.name} is sold out`
                    : product.customizable
                      ? `Choose options for ${product.name}`
                      : `Add ${product.name} to cart`
                }
                className="inline-flex min-h-11 min-w-20 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>{isOutOfStock ? "Sold out" : product.customizable ? "Add +" : "Add"}</span>
              </button>
            ) : (
              <div
                role="group"
                aria-label={`Quantity of ${product.name}`}
                className="flex shrink-0 items-center rounded-lg bg-primary text-primary-foreground"
              >
                <button
                  type="button"
                  onClick={handleDecrement}
                  disabled={busy}
                  aria-label={`Remove one ${product.name}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
                <span
                  className="min-w-6 shrink-0 text-center text-sm font-semibold tabular-nums"
                  aria-live="polite"
                >
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={handleIncrement}
                  disabled={busy || isOutOfStock || qty >= 99}
                  aria-label={`Add one ${product.name}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
