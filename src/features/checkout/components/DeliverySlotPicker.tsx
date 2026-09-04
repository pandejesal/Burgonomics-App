import * as React from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";
// Deprecated: checkout now offers Standard Delivery only (25-35 mins, ASAP).
// Kept for backward compat; do not render in new flows.

export interface DeliverySlot {
  id: string;
  type: "instant" | "scheduled";
  label: string;
  timeRange: string;
  isAvailable: boolean;
}

const DEFAULT_SLOTS: DeliverySlot[] = [
  {
    id: "slot_instant",
    type: "instant",
    label: "⚡ Standard Delivery (Fastest)",
    timeRange: "25–35 mins",
    isAvailable: true,
  },
  {
    id: "slot_sch_1",
    type: "scheduled",
    label: "Later Today",
    timeRange: "7:30 PM – 8:00 PM",
    isAvailable: true,
  },
  {
    id: "slot_sch_2",
    type: "scheduled",
    label: "Later Today",
    timeRange: "8:00 PM – 8:30 PM",
    isAvailable: true,
  },
  {
    id: "slot_sch_3",
    type: "scheduled",
    label: "Later Today",
    timeRange: "8:30 PM – 9:00 PM",
    isAvailable: true,
  },
];

interface DeliverySlotPickerProps {
  selectedSlotId?: string;
  onSelectSlot: (slot: DeliverySlot) => void;
  className?: string;
}

export function DeliverySlotPicker({
  selectedSlotId = "slot_instant",
  onSelectSlot,
  className,
}: DeliverySlotPickerProps) {
  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-[#0E4825] dark:text-[#4ADE80]" />
        <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
          Delivery Time Slot
        </h4>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {DEFAULT_SLOTS.map((slot) => {
          const isSelected = selectedSlotId === slot.id;
          return (
            <button
              key={slot.id}
              type="button"
              onClick={() => {
                void HapticService.selection();
                onSelectSlot(slot);
              }}
              className={cn(
                "p-3 rounded-xl border text-left transition-all cursor-pointer select-none flex items-center justify-between gap-2 min-h-[44px]",
                isSelected
                  ? "border-[#0E4825] bg-[#0E4825]/10 shadow-xs ring-1 ring-[#0E4825]"
                  : "border-divider bg-surface hover:border-primary/40"
              )}
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-text truncate">
                  {slot.label}
                </p>
                <p className="text-[11px] text-text-secondary font-mono">
                  {slot.timeRange}
                </p>
              </div>

              <span
                className={cn(
                  "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                  isSelected
                    ? "border-[#0E4825] bg-[#0E4825] text-white"
                    : "border-divider"
                )}
              >
                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default DeliverySlotPicker;
