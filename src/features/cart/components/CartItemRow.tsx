import * as React from "react";
import { Minus, Plus, Trash2, StickyNote } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { Text } from "@/shared/components/common/Text";
import { VegIndicator } from "@/shared/components/common/VegIndicator";
import { AppBadge } from "@/shared/components/common/AppBadge";
import { SafeImage } from "@/shared/components/common/SafeImage";
import { formatINR } from "@/core/utils/format";
import type { CartLine } from "@/features/cart/models";
import { computeLineTotal, computeLineUnitPrice } from "@/features/cart/services/cartService";
import { HapticService } from "@/core/services/haptics";
import { AudioService } from "@/core/services/audio";

interface Props {
  line: CartLine;
  onQuantityChange: (qty: number) => void;
  onRemove: () => void;
  onNotesChange: (notes: string) => void;
}

/**
 * A single cart line. Fully data-driven — image, veg indicator, and
 * modifier list all render from repository fields.
 * Upgraded with premium hardware-accelerated odometer transitions and physical haptics.
 */
export const CartItemRow = React.memo(function CartItemRow({
  line,
  onQuantityChange,
  onRemove,
  onNotesChange,
}: Props) {
  const [notesOpen, setNotesOpen] = React.useState(!!line.notes);
  const unavailable = line.availability === "unavailable";
  const unitPrice = computeLineUnitPrice(line);
  const lineTotal = computeLineTotal(line);

  const handleDecrement = () => {
    HapticService.impact("light");
    AudioService.playClick();
    onQuantityChange(line.quantity - 1);
  };

  const handleIncrement = () => {
    HapticService.impact("medium");
    AudioService.playClick();
    onQuantityChange(line.quantity + 1);
  };

  const handleRemoveClick = () => {
    HapticService.impact("medium");
    AudioService.playClick();
    onRemove();
  };

  return (
    <motion.article
      layout
      animate={{
        scale: [1, 1.01, 1],
      }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      aria-label={`${line.name}, quantity ${line.quantity}`}
      className={cn(
        "rounded-[var(--radius-large)] border border-divider bg-surface p-3",
        "transition-opacity",
        unavailable && "opacity-60",
      )}
    >
      <div className="flex gap-3">
        <div className="h-20 w-20 flex-none overflow-hidden rounded-[var(--radius-medium)] bg-bg-secondary">
          {line.imageUrl ? (
            <SafeImage
              src={line.imageUrl}
              fallbackSrc={line.fallbackImageUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-text-secondary">
              <VegIndicator veg={line.veg ?? true} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                {typeof line.veg === "boolean" && <VegIndicator veg={line.veg} />}
                <Text variant="titleMedium" className="truncate">
                  {line.name}
                </Text>
              </div>
              {line.modifiers.length > 0 && (
                <ul className="mt-0.5 space-y-0.5">
                  {line.modifiers.map((m) => (
                    <li
                      key={`${m.groupId}-${m.optionId}`}
                      className="type-caption text-text-secondary"
                    >
                      {m.groupName}: {m.name}
                      {m.priceDelta !== 0 && (
                        <span className="ml-1 text-text-disabled">
                          ({m.priceDelta > 0 ? "+" : "-"}
                          {formatINR(Math.abs(m.priceDelta))})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <Text variant="caption" tone="secondary" className="mt-1">
                {formatINR(unitPrice)} each
              </Text>
            </div>
            <button
              type="button"
              onClick={handleRemoveClick}
              aria-label={`Remove ${line.name}`}
              className="grid h-9 w-9 flex-none place-items-center rounded-full text-text-secondary hover:bg-bg-secondary hover:text-error transition-colors"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {unavailable && (
            <div className="mt-1">
              <AppBadge tone="warning">{line.unavailableReason ?? "Unavailable"}</AppBadge>
            </div>
          )}

          <div className="mt-2 flex items-center justify-between gap-2">
            <div
              role="group"
              aria-label={`Quantity for ${line.name}`}
              className="inline-flex items-center rounded-full border border-divider overflow-hidden"
            >
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={handleDecrement}
                disabled={unavailable}
                className="grid h-11 w-11 place-items-center rounded-full text-primary hover:bg-bg-secondary transition-colors disabled:opacity-40 active:scale-95"
              >
                <Minus className="h-4 w-4" aria-hidden />
              </button>
              <div className="relative h-11 min-w-8 overflow-hidden flex items-center justify-center">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={line.quantity}
                    initial={{ y: 12, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -12, opacity: 0 }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                    className="absolute font-bold text-center text-sm tabular-nums"
                    aria-live="polite"
                  >
                    {line.quantity}
                  </motion.span>
                </AnimatePresence>
              </div>
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={handleIncrement}
                disabled={unavailable}
                className="grid h-11 w-11 place-items-center rounded-full text-primary hover:bg-bg-secondary transition-colors disabled:opacity-40 active:scale-95"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <Text variant="titleMedium">{formatINR(lineTotal)}</Text>
          </div>

          {/* Notes toggle */}
          <div className="mt-2">
            {!notesOpen ? (
              <button
                type="button"
                onClick={() => setNotesOpen(true)}
                className="inline-flex items-center gap-1 type-caption text-primary hover:underline"
              >
                <StickyNote className="h-3.5 w-3.5" aria-hidden />
                {line.notes ? "Edit note" : "Add cooking instructions"}
              </button>
            ) : (
              <label className="block">
                <span className="sr-only">Cooking instructions for {line.name}</span>
                <textarea
                  value={line.notes ?? ""}
                  onChange={(e) => onNotesChange(e.target.value.slice(0, 200))}
                  placeholder="e.g. no onions, extra spicy, cut into halves"
                  rows={2}
                  className="w-full rounded-[var(--radius-medium)] border border-divider bg-surface px-3 py-2 type-body-medium outline-none focus:border-primary transition-colors"
                />
                <div className="mt-1 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      onNotesChange("");
                      setNotesOpen(false);
                    }}
                    className="type-caption text-text-secondary hover:underline"
                  >
                    Remove note
                  </button>
                  <span className="type-caption text-text-secondary">
                    {(line.notes ?? "").length}/200
                  </span>
                </div>
              </label>
            )}
          </div>
        </div>
      </div>
    </motion.article>
  );
});
