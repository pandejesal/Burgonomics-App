import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  className?: string;
}

export function QuantityStepper({ value, onChange, min = 1, max = 99, className }: Props) {
  const handleDecrease = () => {
    if (value > min) {
      void HapticService.impact("light");
      onChange(value - 1);
    }
  };

  const handleIncrease = () => {
    if (value < max) {
      void HapticService.impact("light");
      onChange(value + 1);
    }
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-divider bg-surface select-none shadow-sm",
        className,
      )}
      role="group"
      aria-label="Quantity"
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={handleDecrease}
        disabled={value <= min}
        className="grid h-11 w-11 place-items-center rounded-full text-primary disabled:opacity-30 active:scale-90 active:opacity-75 transition-all duration-150 cursor-pointer disabled:cursor-not-allowed"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span
        className="min-w-8 text-center type-title-medium tabular-nums font-bold"
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={handleIncrease}
        disabled={value >= max}
        className="grid h-11 w-11 place-items-center rounded-full text-primary disabled:opacity-30 active:scale-90 active:opacity-75 transition-all duration-150 cursor-pointer disabled:cursor-not-allowed"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
