import * as React from "react";
import { Bike, ShoppingBag, UtensilsCrossed, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";
import type { Fulfillment, StoreSupport } from "@/features/stores/models/Store";
import { checkMinimumOrder, type PricingFulfillment } from "@/shared/pricing/pricingEngine";

interface OrderTypeToggleProps {
  value: Fulfillment | null;
  onChange: (fulfillment: Fulfillment) => void;
  /** Current basket subtotal, used for the delivery minimum-order hint. */
  subtotal?: number;
  /** Outlet capabilities. Absent = every mode offered. */
  supports?: StoreSupport | null;
  className?: string;
}

interface Option {
  id: PricingFulfillment;
  label: string;
  emoji: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** Short consequence line under the label. */
  hint: string;
}

const OPTIONS: Option[] = [
  { id: "delivery", label: "Delivery", emoji: "🛵", Icon: Bike, hint: "₹149 min • prepaid only" },
  { id: "takeaway", label: "Takeaway", emoji: "🛍️", Icon: ShoppingBag, hint: "Pick up at counter" },
  { id: "dinein", label: "Dine-In", emoji: "🍽️", Icon: UtensilsCrossed, hint: "Served to your table" },
];

function supportsMode(supports: StoreSupport | null | undefined, mode: PricingFulfillment): boolean {
  if (!supports) return true;
  if (mode === "delivery") return !!supports.delivery;
  if (mode === "takeaway") return !!supports.takeaway;
  return !!supports.dineIn;
}

/**
 * OrderTypeToggle — the prominent 3-way fulfillment switch on Checkout.
 *
 * Writing through to `useStoreSelection.setFulfillment` (not a local flag)
 * is deliberate: fulfillment is the app-wide order type, and the cart totals,
 * the payment-method rules, the address gate and the order payload all read
 * it from there. A local copy would price one mode and submit another.
 *
 * Delivery carries the ₹149 minimum, so the shortfall is surfaced inline here
 * rather than only at PAY time — the customer learns it while switching, not
 * after filling the form.
 */
export function OrderTypeToggle({
  value,
  onChange,
  subtotal = 0,
  supports,
  className,
}: OrderTypeToggleProps) {
  const active = (value ?? "delivery") as PricingFulfillment;

  const deliveryShortfall =
    active === "delivery" && subtotal > 0 ? checkMinimumOrder(subtotal, "delivery") : null;

  return (
    <section
      aria-labelledby="order-type-heading"
      className={cn(
        "rounded-2xl border border-divider bg-surface p-4 shadow-xs space-y-3",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <h2
          id="order-type-heading"
          className="text-xs font-bold uppercase tracking-wider text-text"
        >
          Order Type
        </h2>
        <span className="text-[10px] text-text-secondary">Changes your fees &amp; payment options</span>
      </div>

      <div
        role="radiogroup"
        aria-label="Order type"
        className="grid grid-cols-3 gap-2 rounded-2xl bg-bg-secondary p-1.5 border border-divider"
      >
        {OPTIONS.map((opt) => {
          const isSelected = active === opt.id;
          const enabled = supportsMode(supports, opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={!enabled}
              onClick={() => {
                if (!enabled || isSelected) return;
                void HapticService.selection();
                onChange(opt.id);
              }}
              className={cn(
                "flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 transition-all",
                isSelected
                  ? "bg-[#0E4825] text-white shadow-sm"
                  : enabled
                    ? "text-text-secondary hover:bg-surface hover:text-text cursor-pointer"
                    : "text-text-secondary opacity-40 cursor-not-allowed",
              )}
            >
              <span className="flex items-center gap-1 text-xs font-black leading-tight">
                <span aria-hidden>{opt.emoji}</span>
                <span className={cn(isSelected ? "text-white" : "text-text")}>{opt.label}</span>
              </span>
              <span
                className={cn(
                  "text-[9px] font-medium leading-tight text-center",
                  isSelected ? "text-white/75" : "text-text-secondary",
                )}
              >
                {enabled ? opt.hint : "Unavailable"}
              </span>
            </button>
          );
        })}
      </div>

      {deliveryShortfall && !deliveryShortfall.met && deliveryShortfall.message && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-800 dark:text-amber-200"
        >
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{deliveryShortfall.message}</span>
        </p>
      )}
    </section>
  );
}

export default OrderTypeToggle;
