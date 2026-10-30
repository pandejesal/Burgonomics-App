import * as React from "react";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";
import type { Fulfillment } from "@/features/stores/models/Store";

interface ModeSegmentedSwitchProps {
  value: Fulfillment | null;
  onChange: (mode: Fulfillment) => void;
  className?: string;
}

interface ModeOption {
  id: Fulfillment;
  label: string;
}

/**
 * One 48px row, three text segments, one green fill for the active mode.
 *
 * No icons: an icon stacked over a label doubled the control height and gave
 * two competing signals for the same state. Text alone stays legible at 200%.
 */
const MODES: ModeOption[] = [
  { id: "delivery", label: "Delivery" },
  { id: "takeaway", label: "Takeaway" },
  { id: "dinein", label: "Dine-in" },
];

export function ModeSegmentedSwitch({
  value = "delivery",
  onChange,
  className,
}: ModeSegmentedSwitchProps) {
  const current = value || "delivery";

  return (
    <div
      role="radiogroup"
      aria-label="Fulfillment mode"
      onKeyDown={(event) => {
        const currentIndex = MODES.findIndex((mode) => mode.id === current);
        let nextIndex: number;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % MODES.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (currentIndex + MODES.length - 1) % MODES.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = MODES.length - 1;
        else return;
        event.preventDefault();
        onChange(MODES[nextIndex].id);
        event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="radio"]')[nextIndex]?.focus();
      }}
      className={cn(
        "flex w-full items-stretch gap-1 rounded-xl bg-bg-secondary p-1",
        className,
      )}
    >
      {MODES.map(({ id, label }) => {
        const isSelected = current === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => {
              if (!isSelected) {
                void HapticService.selection();
                onChange(id);
              }
            }}
            className={cn(
              "flex min-h-12 min-w-0 flex-1 items-center justify-center rounded-[10px] px-2 py-2 text-center text-sm leading-snug focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:text-base",
              isSelected
                ? "bg-primary font-semibold text-primary-foreground"
                : "font-medium text-text-secondary hover:text-text-primary",
            )}
          >
            <span className="max-w-full break-words">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
