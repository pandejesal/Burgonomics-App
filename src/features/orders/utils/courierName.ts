/**
 * Customer-facing delivery-partner name.
 *
 * Customer copy must never assert a courier brand the order does not carry.
 * Orders can be dispatched to Borzo or Shadowfax (and legacy Porter bookings
 * exist), so the only honest sources are the order's own partner fields.
 * Internal identifiers keep their names; this is display text only.
 */
import type { Order } from "@/features/orders/models";

/** Used when the order carries no partner name — never a guessed brand. */
export const DEFAULT_COURIER_NAME = "Delivery partner";

export function courierDisplayName(order: Order | null | undefined): string {
  const delivery = (
    order as
      | {
          delivery?: {
            providerName?: unknown;
            partnerName?: unknown;
          };
        }
      | null
      | undefined
  )?.delivery;

  const candidates = [
    order?.deliveryPartner?.name,
    delivery?.providerName,
    delivery?.partnerName,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return DEFAULT_COURIER_NAME;
}

/** True when the order does not name its courier (used for neutral copy). */
export function hasNamedCourier(order: Order | null | undefined): boolean {
  return courierDisplayName(order) !== DEFAULT_COURIER_NAME;
}
