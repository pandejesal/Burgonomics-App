import * as React from "react";
import { MapPin, Store as StoreIcon, UtensilsCrossed, Bike } from "lucide-react";
import type { Store } from "@/features/stores/models/Store";
import type { Address } from "@/features/addresses/models";
import type { Fulfillment } from "@/features/stores/models/Store";

interface Props {
  fulfillment: Fulfillment;
  store: Store | null;
  selectedAddress: Address | null;
  tableNumber: string;
  onTableNumberChange: (v: string) => void;
}

/**
 * FulfillmentDetailsCard — checkout section 1. Summarizes the active
 * fulfillment mode (store + address snapshot) and collects the dine-in
 * table number. Address editing lives on /profile/addresses; this card
 * never invents location data.
 */
export function FulfillmentDetailsCard({
  fulfillment,
  store,
  selectedAddress,
  tableNumber,
  onTableNumberChange,
}: Props) {
  const Icon = fulfillment === "delivery" ? Bike : fulfillment === "dinein" ? UtensilsCrossed : StoreIcon;
  const title =
    fulfillment === "delivery" ? "Delivery details" : fulfillment === "dinein" ? "Dine-in details" : "Takeaway details";

  return (
    <section aria-label={title} className="rounded-2xl border border-divider bg-surface p-4 shadow-xs space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0E4825]/10 text-[#0E4825] dark:text-[#4ADE80]">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-xs font-bold uppercase tracking-wider text-text">{title}</h2>
          <p className="text-xs font-bold text-text truncate">
            {store ? store.name : "No store selected"}
          </p>
          {store && (
            <p className="text-[11px] text-text-secondary truncate">
              {store.area}
              {store.isOpen === false ? " · Currently closed" : ""}
            </p>
          )}
        </div>
      </div>

      {fulfillment === "delivery" && (
        <div className="flex items-start gap-2 rounded-xl bg-bg-secondary px-3 py-2.5">
          <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-text-secondary" aria-hidden />
          {selectedAddress ? (
            <p className="text-xs text-text">
              <span className="font-bold capitalize">
                {selectedAddress.label === "other"
                  ? (selectedAddress.customLabel ?? "Other")
                  : selectedAddress.label}
              </span>
              <span className="text-text-secondary"> · {selectedAddress.line1}, {selectedAddress.city}</span>
            </p>
          ) : (
            <p className="text-xs text-text-secondary">
              No delivery address selected yet — pick one below.
            </p>
          )}
        </div>
      )}

      {fulfillment === "dinein" && (
        <div>
          <label htmlFor="fulfillment-table" className="block text-[11px] font-bold text-text-secondary mb-1">
            Table number <span className="text-red-500">*</span>
          </label>
          <input
            id="fulfillment-table"
            type="text"
            inputMode="text"
            placeholder="e.g. T12"
            value={tableNumber}
            onChange={(e) => onTableNumberChange(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-divider bg-bg-secondary px-3.5 py-2 text-xs text-text outline-none focus:border-primary transition-colors"
          />
          {!tableNumber.trim() && (
            <p className="mt-1 text-[11px] text-amber-600">
              Add your table number so the crew knows where to serve.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
