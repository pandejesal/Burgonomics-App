import { Text } from "@/shared/components/common/Text";
import { AppBadge } from "@/shared/components/common/AppBadge";
import { VegIndicator } from "@/shared/components/common/VegIndicator";
import { formatINR } from "@/core/utils/format";
import { computeLineTotal } from "@/features/cart/services/cartService";
import type { CartLine } from "@/features/cart/models";

interface Props {
  lines: CartLine[];
}

/**
 * ReviewItemsList — read-only summary of cart lines shown on Checkout.
 * Quantity edits happen back on the Cart screen (data-driven via the
 * cart repository); no mutation UI lives here.
 */
export function ReviewItemsList({ lines }: Props) {
  return (
    <ul aria-label="Order items" className="space-y-3">
      {lines.map((line) => {
        const unavailable = line.availability === "unavailable";
        return (
          <li
            key={line.lineId}
            className="flex items-start gap-3"
            aria-label={`${line.name}, quantity ${line.quantity}`}
          >
            <div className="grid h-8 min-w-8 place-items-center rounded-full bg-primary/10 px-2 type-title-medium tabular-nums text-primary">
              {line.quantity}×
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                {typeof line.veg === "boolean" && <VegIndicator veg={line.veg} />}
                <Text variant="titleMedium" className="truncate">
                  {line.name}
                </Text>
                {unavailable && (
                  <AppBadge tone="warning">{line.unavailableReason ?? "Unavailable"}</AppBadge>
                )}
              </div>
              {line.modifiers.length > 0 && (
                <ul className="mt-0.5 space-y-0.5">
                  {line.modifiers.map((m) => (
                    <li
                      key={`${m.groupId}-${m.optionId}`}
                      className="type-caption text-text-secondary"
                    >
                      {m.groupName}: {m.name}
                    </li>
                  ))}
                </ul>
              )}
              {line.notes && (
                <Text variant="caption" tone="secondary" className="mt-0.5 block">
                  Note: {line.notes}
                </Text>
              )}
            </div>
            <Text variant="titleMedium" className="tabular-nums">
              {formatINR(computeLineTotal(line))}
            </Text>
          </li>
        );
      })}
    </ul>
  );
}
