import { Bike, ShoppingBag, Utensils } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Fulfillment } from "@/features/cart/models";
import type { Store } from "@/features/stores/models/Store";

interface Props {
  value: Fulfillment;
  onChange: (f: Fulfillment) => void;
  store?: Store | null;
}

/**
 * Fulfillment picker. Options that the current store does not support
 * are automatically hidden — driven entirely by `store.supports`.
 */
export function FulfillmentSelector({ value, onChange, store }: Props) {
  const options = (
    [
      {
        key: "delivery" as Fulfillment,
        label: "Delivery",
        Icon: Bike,
        enabled: store?.supports.delivery ?? true,
      },
      {
        key: "takeaway" as Fulfillment,
        label: "Takeaway",
        Icon: ShoppingBag,
        enabled: store?.supports.takeaway ?? true,
      },
      {
        key: "dinein" as Fulfillment,
        label: "Dine-in",
        Icon: Utensils,
        enabled: store?.supports.dineIn ?? true,
      },
    ] as const
  ).filter((o) => o.enabled);

  return (
    <div role="radiogroup" aria-label="Fulfillment method" className="grid grid-cols-3 gap-2">
      {options.map(({ key, label, Icon }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(key)}
            className={cn(
              "flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-[var(--radius-medium)] border-[1.5px] p-2 transition-colors",
              active
                ? "border-primary bg-primary/5 text-primary"
                : "border-divider bg-surface text-text-secondary hover:border-primary/40",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
            <span className="type-caption">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
