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
}

/**
 * FloatingCartBar — Viewport-fixed bottom bar whenever cart has items.
 * Portaled to document.body so it stays fixed above BottomTabBar and never scrolls with page content.
 * Uses safe-area inset to avoid overlap with iOS home indicator.
 */
export function FloatingCartBar({
  className,
  bottomOffset = "bottom-[calc(64px+env(safe-area-inset-bottom,0px)+8px)]",
}: FloatingCartBarProps) {
  const hydrated = useHydrated();
  const lines = useCartStore((s) => s.lines);
  const itemCount = useCartStore(selectItemCount);

  const subtotal = React.useMemo(() => {
    return lines.reduce((sum, l) => sum + (l.unitPrice || 0) * (l.quantity || 1), 0);
  }, [lines]);

  if (!hydrated || itemCount === 0) return null;

  const content = (
    <AnimatePresence>
      <motion.aside
        aria-label={`Floating cart summary, ${itemCount} items, total ${formatINR(subtotal)}`}
        initial={{ y: 80, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 80, opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        className={cn(
          "fixed inset-x-0 z-50 mx-auto w-full max-w-[520px] px-4 pointer-events-none",
          bottomOffset,
          className,
        )}
      >
        <Link
          to="/cart"
          onClick={() => void HapticService.selection()}
          className="pointer-events-auto flex w-full items-center justify-between gap-3 rounded-2xl bg-[#0E4825] px-4 py-3 text-white shadow-2xl transition-transform duration-150 active:scale-[0.98] border border-[#4ADE80]/30 hover:border-[#4ADE80]/60 cursor-pointer"
        >
          {/* Left info: Icon & counts */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur-sm">
              <ShoppingBag className="h-5 w-5 text-[#4ADE80]" />
              <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#FF6600] px-1 text-[10px] font-black text-white ring-2 ring-[#0E4825]">
                {itemCount}
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-sm font-extrabold text-white">
                  {formatINR(subtotal)}
                </span>
                <span className="text-[11px] text-white/80 font-medium">
                  ({itemCount} {itemCount === 1 ? "item" : "items"})
                </span>
              </div>
              <p className="text-[10px] text-[#4ADE80] font-medium truncate">
                100% Pure Veg • Taxes included
              </p>
            </div>
          </div>

          {/* Right action button */}
          <div className="flex items-center gap-1.5 rounded-xl bg-[#FF6600] hover:bg-[#e05a00] px-4 py-2 text-xs font-black uppercase tracking-wider text-white shadow-md transition-colors">
            <span>View Cart</span>
            <ArrowRight className="h-4 w-4 stroke-[2.5px]" />
          </div>
        </Link>
      </motion.aside>
    </AnimatePresence>
  );

  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
}

export default FloatingCartBar;
