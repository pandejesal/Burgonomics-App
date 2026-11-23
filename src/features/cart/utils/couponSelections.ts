/**
 * M9 — the priced SELECTIONS a coupon quote must carry.
 *
 * The server prices add-ons from its own catalogue by option id (the same
 * validator cash create and online checkout use). Sending only a product id and
 * quantity made a percentage discount or a minimum-spend test disagree with the
 * real bill. This helper derives the wire selections from the cart line's
 * modifiers/customizations so every lane prices the identical basket.
 */
import type { CartLine } from "@/features/cart/models";

export interface CouponSelection {
  id?: string;
  optionId?: string;
  groupName?: string;
  name?: string;
  price?: number;
  priceDelta?: number;
}

export function couponSelectionsForLine(line: CartLine): {
  customizations?: CouponSelection[];
  modifiers?: CouponSelection[];
} {
  const modifiers: CouponSelection[] = (line.modifiers ?? []).map((m) => ({
    id: m.optionId,
    optionId: m.optionId,
    groupName: m.groupName,
    name: m.name,
    priceDelta: m.priceDelta,
  }));
  const customizations: CouponSelection[] = [];
  for (const raw of line.customizations ?? []) {
    const c = raw as any;
    const id = typeof c?.optionId === "string" ? c.optionId : typeof c?.id === "string" ? c.id : "";
    if (!id) continue; // display-only snapshot with no catalogue id
    customizations.push({
      id,
      optionId: id,
      groupName: c.groupName,
      name: c.name ?? c.optionName,
      ...(typeof c.price === "number" ? { price: c.price } : {}),
      ...(typeof c.priceDelta === "number" ? { priceDelta: c.priceDelta } : {}),
    });
  }
  return {
    ...(customizations.length ? { customizations } : {}),
    ...(modifiers.length ? { modifiers } : {}),
  };
}
