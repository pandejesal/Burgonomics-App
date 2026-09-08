import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { ShoppingBag, ArrowRight } from "lucide-react";
import { formatINR } from "@/core/utils/format";
import { useCartStore, selectItemCount } from "@/features/cart/state/cartStore";
import { HapticService } from "@/core/services/haptics";

/**
 * FloatingCartBar — persistent mini-cart pill shown on menu/home/search.
 * Renders only when the cart has lines; navigates to /cart on tap.
 * The amount shown is a lines-subtotal preview; the server reprices
 * authoritatively at checkout.
 */
export const FloatingCartBar = React.memo(function FloatingCartBar() {
  const navigate = useNavigate();
  const lines = useCartStore((s) => s.lines);
  const itemCount = useCartStore(selectItemCount);

  if (lines.length === 0) return null;

  const preview = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);

  return (
    <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom,0px))] z-30 px-4 pointer-events-none">
      <button
        type="button"
        onClick={() => {
          void HapticService.selection();
          void navigate({ to: "/cart" });
        }}
        className="pointer-events-auto mx-auto flex max-w-[520px] w-full items-center justify-between gap-3 rounded-2xl bg-[#0E4825] px-4 py-3 text-white shadow-xl active:scale-[0.99] transition-all cursor-pointer"
        aria-label={`View cart, ${itemCount} items, ${formatINR(preview)}`}
      >
        <span className="flex items-center gap-2 text-xs font-bold">
          <ShoppingBag className="h-4 w-4" aria-hidden />
          <span>
            {itemCount} {itemCount === 1 ? "item" : "items"} · {formatINR(preview)}
          </span>
        </span>
        <span className="flex items-center gap-1 text-xs font-extrabold uppercase tracking-wider">
          View cart
          <ArrowRight className="h-4 w-4" aria-hidden />
        </span>
      </button>
    </div>
  );
});
