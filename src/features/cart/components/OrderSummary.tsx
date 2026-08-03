import { Text } from "@/shared/components/common/Text";
import { formatINR } from "@/core/utils/format";
import type { CartTotals } from "@/features/cart/models";

interface Props {
  totals: CartTotals;
  itemCount: number;
}

/**
 * Order summary. Every value comes from `calculateTotals` in the
 * cart service — no formulas hardcoded in the UI.
 */
export function OrderSummary({ totals, itemCount }: Props) {
  const rows: Array<{ label: string; value: number; negative?: boolean; hideIfZero?: boolean }> = [
    { label: `Subtotal (${itemCount} item${itemCount === 1 ? "" : "s"})`, value: totals.subtotal },
    { label: "Item discounts", value: totals.itemDiscount, negative: true, hideIfZero: true },
    { label: "Promo discount", value: totals.promoDiscount, negative: true, hideIfZero: true },
    { label: "Taxes", value: totals.taxes, hideIfZero: true },
    { label: "Packing charges", value: totals.packingFee, hideIfZero: true },
    { label: "Delivery fee", value: totals.deliveryFee, hideIfZero: true },
  ];

  return (
    <section
      aria-labelledby="summary-heading"
      className="rounded-[var(--radius-large)] border border-divider bg-surface p-4"
    >
      <Text id="summary-heading" variant="titleLarge" className="mb-3">
        Order summary
      </Text>
      <dl className="space-y-2">
        {rows.map((r) =>
          r.hideIfZero && r.value === 0 ? null : (
            <div key={r.label} className="flex items-center justify-between">
              <dt className="type-body-medium text-text-secondary">{r.label}</dt>
              <dd className="type-body-medium tabular-nums">
                {r.negative ? "− " : ""}
                {formatINR(Math.abs(r.value))}
              </dd>
            </div>
          ),
        )}
      </dl>
      <div className="mt-3 flex items-center justify-between border-t border-divider pt-3">
        <Text variant="titleLarge">Grand total</Text>
        <Text variant="titleLarge" className="tabular-nums">
          {formatINR(totals.grandTotal)}
        </Text>
      </div>
      <Text variant="caption" tone="secondary" className="mt-1 block">
        Taxes and fees shown are estimates and will be finalised at checkout.
      </Text>
    </section>
  );
}
