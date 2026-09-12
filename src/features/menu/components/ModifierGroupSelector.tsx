import * as React from "react";
import { Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";
import type { CustomizationGroup, CustomizationOption } from "../models";

export type ModifierSelections = Record<string, string[]>; // groupId -> optionIds

interface ModifierGroupSelectorProps {
  group: CustomizationGroup;
  selectedOptionIds: string[];
  onToggleOption: (groupId: string, optionId: string) => void;
  className?: string;
}

/**
 * ModifierGroupSelector — Renders mandatory or optional modifier groups.
 * Features strict 60-30-10 palette with #0E4825 Forest Green selection states,
 * #FF6600 Required tags, live selection counters, and out-of-stock guards.
 */
export function ModifierGroupSelector({
  group,
  selectedOptionIds = [],
  onToggleOption,
  className,
}: ModifierGroupSelectorProps) {
  const isSingle = group.selection === "single";
  const isRequired = group.required;
  const hasValidSelection = isRequired ? selectedOptionIds.length > 0 : true;

  const handleOptionClick = (option: CustomizationOption) => {
    if (option.outOfStock) return;
    void HapticService.selection();
    onToggleOption(group.id, option.id);
  };

  const selectedCount = selectedOptionIds.length;

  return (
    <fieldset className={cn("space-y-2.5", className)}>
      <legend className="flex items-center justify-between w-full pb-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-text">{group.name}</span>
          {isRequired && (
            <span className="px-2 py-0.5 rounded-md bg-[#FF6600]/10 text-[#FF6600] text-[10px] font-black uppercase tracking-wider">
              Required
            </span>
          )}
        </div>

        <span className="text-[11px] text-text-secondary font-medium">
          {isSingle
            ? selectedCount > 0
              ? "1 selected"
              : "Choose 1"
            : group.maxSelect
            ? `Up to ${group.maxSelect}${selectedCount > 0 ? ` (${selectedCount} selected)` : ""}`
            : selectedCount > 0
            ? `${selectedCount} selected`
            : "Optional"}
        </span>
      </legend>

      {!hasValidSelection && (
        <div className="flex items-center gap-1.5 text-xs text-amber-500 font-medium">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Please select an option to continue</span>
        </div>
      )}

      <div className="space-y-2">
        {group.options.map((opt) => {
          const isSelected = selectedOptionIds.includes(opt.id);
          const isOutOfStock = !!opt.outOfStock;

          return (
            <div
              key={opt.id}
              onClick={() => handleOptionClick(opt)}
              className={cn(
                "flex items-center justify-between gap-3 p-3.5 rounded-xl border transition-all select-none cursor-pointer",
                isSelected
                  ? "border-[#0E4825] bg-[#0E4825]/10 shadow-xs"
                  : "border-divider bg-surface hover:border-primary/40",
                isOutOfStock && "opacity-50 cursor-not-allowed pointer-events-none bg-bg-secondary/40"
              )}
            >
              {/* Left Option Radio / Checkbox & Name */}
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    "flex items-center justify-center shrink-0 transition-all",
                    isSingle
                      ? "w-5 h-5 rounded-full border-2"
                      : "w-5 h-5 rounded-md border-2",
                    isSelected
                      ? "border-[#0E4825] bg-[#0E4825] text-white"
                      : "border-divider bg-surface"
                  )}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3px]" />}
                </div>

                <div className="space-y-0.5 min-w-0">
                  <span className="text-xs sm:text-sm font-bold text-text truncate block">
                    {opt.name}
                  </span>
                  {isOutOfStock && (
                    <span className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                      Unavailable
                    </span>
                  )}
                </div>
              </div>

              {/* Right Price Delta */}
              <span className="text-xs font-mono font-bold text-text-secondary shrink-0">
                {opt.priceDelta > 0
                  ? `+ ₹${opt.priceDelta}`
                  : opt.priceDelta < 0
                  ? `- ₹${Math.abs(opt.priceDelta)}`
                  : "Free"}
              </span>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

export default ModifierGroupSelector;
