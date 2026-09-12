import * as React from "react";
import { Sparkles, Check, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";

export interface UpsellMealCombo {
  id: string;
  name: string;
  description: string;
  price: number;
  savingsLabel?: string;
}

const DEFAULT_MEAL_UPGRADES: UpsellMealCombo[] = [
  {
    id: "combo_upgrade_regular",
    name: "Make it a Regular Meal",
    description: "Crispy Peri-Peri Fries + Cold Beverage",
    price: 99,
    savingsLabel: "Save ₹45",
  },
  {
    id: "combo_upgrade_premium",
    name: "Make it a Gourmet Meal",
    description: "Truffle Loaded Fries + Belgian Chocolate Shake",
    price: 149,
    savingsLabel: "Save ₹75",
  },
];

interface AddonUpsellSectionProps {
  combos?: UpsellMealCombo[];
  selectedComboId?: string | null;
  onToggleCombo: (comboId: string) => void;
  className?: string;
}

export function AddonUpsellSection({
  combos = DEFAULT_MEAL_UPGRADES,
  selectedComboId,
  onToggleCombo,
  className,
}: AddonUpsellSectionProps) {
  const handleToggle = (id: string) => {
    void HapticService.impact("light");
    onToggleCombo(id);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h4 className="text-sm font-bold text-text uppercase tracking-tight">
            Combo Meal Upgrade
          </h4>
        </div>
        <span className="text-[11px] font-bold text-[#FF6600] font-mono">
          Special Meal Pricing
        </span>
      </div>

      <div className="space-y-2">
        {combos.map((combo) => {
          const isSelected = selectedComboId === combo.id;
          return (
            <div
              key={combo.id}
              onClick={() => handleToggle(combo.id)}
              className={cn(
                "flex items-center justify-between gap-3 p-3.5 rounded-xl border transition-all select-none cursor-pointer",
                isSelected
                  ? "border-[#0E4825] bg-[#0E4825]/10 shadow-xs"
                  : "border-divider bg-surface hover:border-primary/40"
              )}
            >
              {/* Left Details */}
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className={cn(
                    "mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all",
                    isSelected
                      ? "border-[#0E4825] bg-[#0E4825] text-white"
                      : "border-divider bg-surface"
                  )}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3px]" />}
                </div>

                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs sm:text-sm font-bold text-text">
                      {combo.name}
                    </span>
                    {combo.savingsLabel && (
                      <span className="px-2 py-0.5 rounded-full bg-[#FF6600] text-white text-[9px] font-black uppercase tracking-wider shadow-xs">
                        {combo.savingsLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-text-secondary line-clamp-1">
                    {combo.description}
                  </p>
                </div>
              </div>

              {/* Right Price */}
              <span className="text-xs font-mono font-bold text-text shrink-0">
                + ₹{combo.price}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AddonUpsellSection;
