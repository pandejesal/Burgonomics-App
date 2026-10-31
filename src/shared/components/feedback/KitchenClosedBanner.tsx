import { MoonStar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useKitchenHours } from "@/shared/hooks/useKitchenHours";
import { KITCHEN_CLOSED_MESSAGE, KITCHEN_OPEN_LABEL } from "@/core/constants/operatingHours";

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
  const { isOpen, minutesUntilOpen } = useKitchenHours();

  if (isOpen) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/15 p-3.5 text-amber-900 shadow-sm dark:text-amber-200",
        className,
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/25 text-amber-700 dark:bg-amber-400/25 dark:text-amber-300">
        <MoonStar className="h-4.5 w-4.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-black uppercase tracking-wide">{message ?? KITCHEN_CLOSED_MESSAGE}</p>
        <p className="mt-0.5 text-[11px] font-medium opacity-90">
          You can browse the full menu now — checkout opens at {KITCHEN_OPEN_LABEL}
          {minutesUntilOpen >= 60
            ? ` (in ${Math.floor(minutesUntilOpen / 60)}h ${minutesUntilOpen % 60}m)`
            : minutesUntilOpen > 0
              ? ` (in ${minutesUntilOpen}m)`
              : ""}
          .
        </p>
      </div>
    </div>
  );
}

export default KitchenClosedBanner;
