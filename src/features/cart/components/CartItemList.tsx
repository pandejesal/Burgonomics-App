import * as React from "react";
import { Plus, Minus, Trash2 } from "lucide-react";
import { formatINR } from "@/core/utils/format";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";
import { useCartStore } from "../state/cartStore";
import { cartRepository } from "../repositories/CartRepository";
import type { CartLine } from "../models";

interface CartItemListProps {
  className?: string;
}

/**
 * CartItemList — Renders a clean list of cart line items with pure veg indicators,
 * explicit modifier lists, and accessible +/- quantity steppers.
 */
export function CartItemList({ className }: CartItemListProps) {
  const lines = useCartStore((s) => s.lines);

  const handleIncrement = async (line: CartLine) => {
    void HapticService.impact("light");
    await cartRepository.updateQuantity(line.lineId, line.quantity + 1);
  };

  const handleDecrement = async (line: CartLine) => {
    void HapticService.impact("light");
    await cartRepository.updateQuantity(line.lineId, line.quantity - 1);
  };

  if (!lines || lines.length === 0) return null;

  return (
    <div className={cn("divide-y divide-divider rounded-2xl bg-surface border border-divider overflow-hidden shadow-xs", className)}>
      {lines.map((line) => {
        const lineTotal = line.unitPrice * line.quantity;
        return (
          <div
            key={line.lineId}
            className="p-4 sm:p-5 flex items-start justify-between gap-3 select-none"
          >
            {/* Left Column: Veg Icon, Name & Modifiers */}
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div
                className="w-4 h-4 rounded-[3px] border-2 border-emerald-600 bg-emerald-950/20 flex items-center justify-center shrink-0 mt-0.5"
                aria-label="100% Pure Vegetarian"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              </div>

              <div className="space-y-1 min-w-0">
                <h4 className="text-xs sm:text-sm font-bold text-text truncate">
                  {line.name}
                </h4>

                {/* Modifiers List */}
                {line.modifiers && line.modifiers.length > 0 && (
                  <div className="space-y-0.5">
                    {line.modifiers.map((m, idx) => (
                      <p key={idx} className="text-[11px] text-text-secondary leading-tight line-clamp-1">
                        • {m.name} {m.priceDelta > 0 ? `(+₹${m.priceDelta})` : ""}
                      </p>
                    ))}
                  </div>
                )}

                {line.notes && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 italic line-clamp-1">
                    Note: "{line.notes}"
                  </p>
                )}

                <span className="block text-xs font-mono font-bold text-text pt-0.5">
                  {formatINR(line.unitPrice)} each
                </span>
              </div>
            </div>

            {/* Right Column: Quantity Stepper & Line Total */}
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex items-center bg-bg-secondary rounded-xl border border-divider p-0.5">
                <button
                  type="button"
                  onClick={() => handleDecrement(line)}
                  aria-label={`Decrease quantity of ${line.name}`}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface text-text active:scale-95 transition-all cursor-pointer"
                >
                  {line.quantity === 1 ? (
                    <Trash2 className="w-4 h-4 text-red-500" />
                  ) : (
                    <Minus className="w-4 h-4" />
                  )}
                </button>

                <span className="w-8 text-center text-xs font-mono font-bold text-text">
                  {line.quantity}
                </span>

                <button
                  type="button"
                  onClick={() => handleIncrement(line)}
                  aria-label={`Increase quantity of ${line.name}`}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface text-text active:scale-95 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <span className="text-xs font-mono font-black text-text">
                {formatINR(lineTotal)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default CartItemList;
