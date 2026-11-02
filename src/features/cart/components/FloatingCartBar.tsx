import * as React from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { ShoppingBag, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { formatINR } from "@/core/utils/format";
import { HapticService } from "@/core/services/haptics";
import { useCartStore, selectItemCount } from "@/features/cart/state/cartStore";
import { useHydrated } from "@/shared/hooks/useHydrated";

interface FloatingCartBarProps {
  className?: string;
  bottomOffset?: string;
  compact?: boolean;
  inline?: boolean;
}

/**
 * FloatingCartBar — Viewport-fixed bottom bar whenever cart has items.
 * Portaled to document.body so it stays fixed above BottomTabBar and never scrolls with page content.
 * Uses safe-area inset to avoid overlap with iOS home indicator.
 */
export function FloatingCartBar({
  className,
  bottomOffset = "bottom-[calc(var(--bottom-nav-offset,86px)+env(safe-area-inset-bottom,0px))]",
  compact = false,
  inline = false,
}: FloatingCartBarProps) {
  const hydrated = useHydrated();
  const lines = useCartStore((s) => s.lines);
  const itemCount = useCartStore(selectItemCount);

  const subtotal = React.useMemo(() => {
    return lines.reduce((sum, l) => sum + (l.unitPrice || 0) * (l.quantity || 1), 0);
  }, [lines]);

  // The bar replaces the "added to cart" toast, so it also has to carry the
  // spoken confirmation. The region stays mounted while empty because a live
  // region inserted together with its text is not reliably announced.
  const hasItems = hydrated && itemCount > 0;
  const liveRegion = (
    <span role="status" aria-live="polite" className="sr-only">
      {hasItems
        ? `Cart updated: ${itemCount} ${itemCount === 1 ? "item" : "items"}, total ${formatINR(subtotal)}`
        : ""}
    </span>
  );

  if (!hasItems) return liveRegion;

  const content = (
    <AnimatePresence>
      <motion.aside
        aria-label={`Floating cart summary, ${itemCount} items, total ${formatINR(subtotal)}`}
        initial={{ y: 80, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 80, opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        className={cn(
          "mx-auto w-full max-w-[520px] px-4 pointer-events-none",
          inline ? "relative" : "fixed inset-x-0 z-50",
          !inline && bottomOffset,
          className,
        )}
      >
        <Link
          to="/cart"
          onClick={() => void HapticService.selection()}
          className={cn(
            // 56px, not 72px: the bar sits above the bottom tab bar, and a
            // 72px shell plus the 44px "View Cart" pill read as a second
            // navigation bar on a phone. The priced row keeps its full 44px
            // tap target inside the shorter shell. `min-h-14` is only a floor:
            // the two non-wrapping lines below are what hold the height at
            // 360dp, where a wrapping text column grew this bar to 124px.
            "pointer-events-auto flex min-h-14 w-full items-center justify-between gap-2 rounded-[var(--radius-large)] border border-primary-foreground/15 bg-primary px-3 py-1 text-primary-foreground shadow-2xl transition-colors duration-150 hover:border-primary-foreground/30 active:scale-[0.99] cursor-pointer",
            compact && "min-h-14 py-1",
          )}
        >
          {/* Never shrinks: with enlarged text a shrinking column let the
              non-wrapping price slide under the opaque pill and lose digits.
              The pill's label wraps to two lines instead. */}
          <div className="flex shrink-0 items-center gap-2">
            <div
              className={cn(
                "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-medium)] bg-primary-foreground/15 text-primary-foreground",
                compact && "hidden",
              )}
            >
              <ShoppingBag className="h-5 w-5" aria-hidden />
              <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-sm font-semibold leading-none text-accent-foreground ring-2 ring-primary">
                {itemCount}
              </span>
            </div>

            <div>
              <span className="block whitespace-nowrap type-price text-base leading-tight text-primary-foreground">
                {formatINR(subtotal)}
              </span>
              <span className="block whitespace-nowrap type-caption leading-tight text-primary-foreground/85">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>
            </div>
          </div>

          <span className="inline-flex min-h-[44px] min-w-11 items-center gap-1.5 rounded-full bg-primary-foreground px-3 text-center text-sm font-semibold leading-none text-primary shadow-sm transition-colors">
            <span>View Cart</span>
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
          </span>
        </Link>
      </motion.aside>
    </AnimatePresence>
  );

  return (
    <>
      {liveRegion}
      {inline || typeof document === "undefined" ? content : createPortal(content, document.body)}
    </>
  );
}

export default FloatingCartBar;
