import * as React from "react";
import { Text } from "@/shared/components/common/Text";
import { formatINR } from "@/core/utils/format";
import type { CustomizationGroup } from "@/features/menu/models";
import { cn } from "@/lib/utils";

export type Selections = Record<string, string[]>; // groupId → optionIds

interface Props {
  groups: CustomizationGroup[];
  value: Selections;
  onChange: (next: Selections) => void;
}

/**
 * Fully data-driven customization renderer. Whatever the repository
 * returns — Size, Cheese, Sauces, Extras, Combo upgrades — the UI
 * handles it. Nothing is hardcoded.
 */
export function CustomizationPicker({ groups, value, onChange }: Props) {
  if (!groups.length) return null;

  const toggle = (group: CustomizationGroup, optionId: string) => {
    const current = value[group.id] ?? [];
    let next: string[];
    if (group.selection === "single") {
      next = [optionId];
    } else {
      next = current.includes(optionId)
        ? current.filter((x) => x !== optionId)
        : [...current, optionId];
      if (group.maxSelect && next.length > group.maxSelect) {
        next = next.slice(-group.maxSelect);
      }
    }
    onChange({ ...value, [group.id]: next });
  };

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <fieldset key={g.id} className="space-y-2">
          <legend className="flex items-baseline justify-between w-full">
            <Text variant="titleMedium">{g.name}</Text>
            <span className="type-caption text-text-secondary">
              {g.required ? "Required" : "Optional"}
              {g.selection === "multi" && g.maxSelect ? ` · up to ${g.maxSelect}` : ""}
            </span>
          </legend>
          <div className="space-y-2">
            {g.options.map((o) => {
              const selected = (value[g.id] ?? []).includes(o.id);
              const disabled = !!o.outOfStock;
              return (
                <label
                  key={o.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-[var(--radius-medium)] border p-3 cursor-pointer transition-colors",
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-divider bg-surface hover:border-primary/40",
                    disabled && "opacity-50 pointer-events-none",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type={g.selection === "single" ? "radio" : "checkbox"}
                      name={g.id}
                      checked={selected}
                      disabled={disabled}
                      onChange={() => toggle(g, o.id)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="type-body-large">{o.name}</span>
                    {disabled && (
                      <span className="type-caption text-text-secondary">Unavailable</span>
                    )}
                  </div>
                  <span className="type-body-medium text-text-secondary">
                    {o.priceDelta > 0
                      ? `+ ${formatINR(o.priceDelta)}`
                      : o.priceDelta < 0
                        ? `- ${formatINR(Math.abs(o.priceDelta))}`
                        : "—"}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
