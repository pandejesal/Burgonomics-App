import { MoonStar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useKitchenHours } from "@/shared/hooks/useKitchenHours";
import { kitchenClosedMessage } from "@/core/constants/operatingHours";

interface KitchenClosedBannerProps {
  className?: string;
  /** Override the copy — defaults to the canonical closed message. */
  message?: string;
}

/**
 * Prominent "we are closed" banner for the top of Menu and Checkout.
 *
 * Renders nothing while the kitchen is open, so screens can drop it in
 * unconditionally instead of each maintaining their own `isOpen` branch.
 * Menu browsing stays fully available behind it — only ordering is gated.
 */
export function KitchenClosedBanner({ className, message }: KitchenClosedBannerProps) {
  const state = useKitchenHours();

  if (state.isOpen) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-3 rounded-[var(--radius-large)] border border-warning/30 bg-warning/10 p-4 text-warning",
        className,
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-medium)] bg-warning/15 text-warning">
        <MoonStar className="h-4.5 w-4.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="type-body font-semibold">{message ?? kitchenClosedMessage(state)}</p>
        {!state.closedByStaff && (
          <p className="mt-1 type-caption">
            You can browse the full menu now — checkout opens at {state.openLabel}
            {state.minutesUntilOpen >= 60
              ? ` (in ${Math.floor(state.minutesUntilOpen / 60)}h ${state.minutesUntilOpen % 60}m)`
              : state.minutesUntilOpen > 0
                ? ` (in ${state.minutesUntilOpen}m)`
                : ""}
            .
          </p>
        )}
      </div>
    </div>
  );
}

export default KitchenClosedBanner;
