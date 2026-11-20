/**
 * Customer-facing delivery-partner name.
 *
 * Customer copy must never assert a courier brand the order does not carry.
 * Orders can be dispatched to Borzo or Shadowfax (and legacy Porter bookings
 * exist), so the only honest sources are the order's own partner fields.
 * Internal identifiers keep their names; this is display text only.
 *
 * The dispatch backend records the carrier as `delivery.provider`
 * ("borzo" / "shadowfax" / "porter") and does NOT write `providerName`, so the
 * tracker used to show the generic fallback as both the label and the value.
 * The provider id is therefore mapped through the closed list below — an
 * unknown provider id is never turned into a brand, and the card falls back to
 * the neutral label instead.
 */
import type { Order } from "@/features/orders/models";

/** Used when the order carries no partner name — never a guessed brand. */
export const DEFAULT_COURIER_NAME = "Delivery partner";

/**
 * Providers our own dispatch adapters book. The id is what Firestore records;
 * the label is what a customer may read. Anything outside this map stays
 * unnamed (fail closed) rather than echoing an internal identifier.
 */
const PROVIDER_LABELS: Record<string, string> = {
  borzo: "Borzo",
  shadowfax: "Shadowfax",
  porter: "Porter",
};

export function courierDisplayName(order: Order | null | undefined): string {
  const delivery = (
    order as
      | {
          delivery?: {
            provider?: unknown;
            providerName?: unknown;
            partnerName?: unknown;
          };
        }
      | null
      | undefined
  )?.delivery;

  const candidates = [order?.deliveryPartner?.name, delivery?.providerName, delivery?.partnerName];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  const provider =
    typeof delivery?.provider === "string" ? delivery.provider.trim().toLowerCase() : "";
  if (provider && PROVIDER_LABELS[provider]) return PROVIDER_LABELS[provider];

  return DEFAULT_COURIER_NAME;
}

/** True when the order does not name its courier (used for neutral copy). */
export function hasNamedCourier(order: Order | null | undefined): boolean {
  return courierDisplayName(order) !== DEFAULT_COURIER_NAME;
}
