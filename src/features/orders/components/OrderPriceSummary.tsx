import { Text } from "@/shared/components/common/Text";
import { formatINR } from "@/core/utils/format";
import type { CartTotals, AppliedPromo } from "@/features/cart/models";

interface Props {
  totals: CartTotals;
  promo?: AppliedPromo | null;
}

/** OrderPriceSummary — read-only rendition of the placed-order totals. */
export function OrderPriceSummary({ totals, promo }: Props) {
  return (
    <dl className="space-y-1.5">
      <Row label="Subtotal" value={totals.subtotal} />
      {totals.itemDiscount > 0 && (
        <Row label="Item discount" value={-totals.itemDiscount} tone="success" />
      )}
      {totals.promoDiscount > 0 && (
        <Row
          label={promo ? `Promo · ${promo.code}` : "Promo"}
          value={-totals.promoDiscount}
          tone="success"
        />
      )}
      {totals.packingFee > 0 && <Row label="Packing" value={totals.packingFee} />}
      {totals.deliveryFee > 0 && <Row label="Delivery" value={totals.deliveryFee} />}
      <Row label="Taxes" value={totals.taxes} />
      <div className="mt-2 flex items-center justify-between border-t border-divider pt-2">
        <Text variant="titleLarge">Grand total</Text>
        <Text variant="titleLarge" className="tabular-nums">
          {formatINR(totals.grandTotal)}
        </Text>
      </div>
    </dl>
  );
}

function Row({ label, value, tone }: { label: string; value: number; tone?: "success" }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="type-body-medium text-text-secondary">{label}</dt>
      <dd
        className={
          "type-body-medium tabular-nums " +
          (tone === "success" ? "text-success" : "text-text-primary")
        }
      >
        {value < 0 ? `- ${formatINR(-value)}` : formatINR(value)}
      </dd>
    </div>
  );
}
