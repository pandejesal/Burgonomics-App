import * as React from "react";
import { CartItemRow } from "./CartItemRow";
import type { CartLine } from "@/features/cart/models";

interface Props {
  lines: CartLine[];
  onQuantityChange: (lineId: string, qty: number) => void;
  onRemove: (lineId: string, name: string) => void;
  onNotesChange: (lineId: string, notes: string) => void;
}

/**
 * CartItemList — presentational list over CartItemRow. No totals math,
 * no repository calls; the owning screen wires callbacks.
 */
export const CartItemList = React.memo(function CartItemList({
  lines,
  onQuantityChange,
  onRemove,
  onNotesChange,
}: Props) {
  return (
    <div className="space-y-2.5">
      {lines.map((line) => (
        <CartItemRow
          key={line.lineId}
          line={line}
          onQuantityChange={(q) => onQuantityChange(line.lineId, q)}
          onRemove={() => onRemove(line.lineId, line.name)}
          onNotesChange={(n) => onNotesChange(line.lineId, n)}
        />
      ))}
    </div>
  );
});
