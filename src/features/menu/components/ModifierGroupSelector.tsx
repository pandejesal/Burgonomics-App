import * as React from "react";
import { cn } from "@/lib/utils";
import { formatINR } from "@/core/utils/format";
import type { CustomizationGroup } from "@/features/menu/models";
import { HapticService } from "@/core/services/haptics";

export type ModifierSelections = Record<string, string[]>; // groupId → optionIds

interface Props {
  group: CustomizationGroup;
  selectedOptionIds: string[];
  onToggleOption: (groupId: string, optionId: string) => void;
}

/**
 * ModifierGroupSelector — single customization group (radio/checkbox)
 * driven entirely by the server-provided group + price deltas.
 */
export const ModifierGroupSelector = React.memo(function ModifierGroupSelector({
  group,
  selectedOptionIds,
  onToggleOption,
}: Props) {
  const single = group.selection === "single";

  return (
    <fieldset className="rounded-2xl border border-divider bg-surface p-3.5">
      <legend className="px-1 text-xs font-bold text-text">
        {group.name}
        {group.required && <span className="text-red-500"> *</span>}
        {!single && typeof group.maxSelect === "number" && group.maxSelect > 0 && (
          <span className="ml-1 font-medium text-text-secondary">(up to {group.maxSelect})</span>
        )}
      </legend>
      <div className="flex flex-wrap gap-1.5" role={single ? "radiogroup" : "group"} aria-label={group.name}>
        {group.options.map((opt) => {
          const selected = selectedOptionIds.includes(opt.id);
          const disabled = opt.outOfStock === true;
          return (
            <button
              key={opt.id}
              type="button"
              role={single ? "radio" : "checkbox"}
              aria-checked={selected}
              disabled={disabled}
              onClick={() => {
                void HapticService.selection();
                onToggleOption(group.id, opt.id);
              }}
              className={cn(
                "rounded-full px-3 py-1.5 min-h-[44px] text-xs font-medium border transition-all cursor-pointer disabled:opacity-40",
                selected
                  ? "bg-[#0E4825] text-white border-[#0E4825] font-bold"
                  : "bg-bg-secondary text-text-secondary border-divider hover:border-primary/40",
              )}
            >
              {opt.name}
              {opt.priceDelta > 0 && <span className="ml-1 font-mono">+{formatINR(opt.priceDelta)}</span>}
              {disabled && <span className="ml-1">(out)</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
});
