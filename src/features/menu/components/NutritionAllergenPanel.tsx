import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NutritionFact } from "../models";

interface NutritionAllergenPanelProps {
  /** Product dietary flag — the only "Dietary" value that is ever derived. */
  veg?: boolean;
  /** Nutrition facts exactly as published on the product document. */
  nutrition?: NutritionFact[];
  className?: string;
}

/**
 * Nutrition + allergen disclosure shared by the product page and the
 * customization sheet.
 *
 * Every number rendered here is read from the product document. The panel
 * never invents macros: a product without published `nutrition` says so,
 * because a fabricated "380 kcal" is a labelling liability and a fabricated
 * allergen line ("contains gluten and dairy") can send someone with an
 * allergy straight to hospital — or worse, make us look like we checked.
 */
export function NutritionAllergenPanel({ veg, nutrition, className }: NutritionAllergenPanelProps) {
  const facts = (nutrition ?? []).filter((f) => f?.label && f?.value).slice(0, 5);
  const hasNutrition = facts.length > 0;

  return (
    <div
      className={cn(
        "rounded-2xl border border-divider bg-bg-secondary/50 p-4 space-y-3 shadow-xs",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-400" aria-hidden />
        <h3 className="text-xs font-bold uppercase tracking-wider text-text">
          Nutritional & Quality Highlights
        </h3>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        {facts.map((fact) => (
          <div
            key={fact.key || fact.label}
            className="rounded-xl bg-surface p-2.5 border border-divider/60"
          >
            <span className="text-[10px] font-medium text-text-secondary block">{fact.label}</span>
            <p className="font-mono text-xs font-bold text-text mt-0.5">{fact.value}</p>
          </div>
        ))}
        {veg !== undefined && (
          <div className="rounded-xl bg-surface p-2.5 border border-divider/60">
            <span className="text-[10px] font-medium text-text-secondary block">Dietary</span>
            <p className="text-xs font-bold text-emerald-600 mt-0.5">
              {veg ? "Pure Veg" : "Non-Veg"}
            </p>
          </div>
        )}
      </div>

      {!hasNutrition && (
        <p className="text-[11px] text-text-secondary leading-snug">
          Per-item nutrition values aren&apos;t published for this item yet.
        </p>
      )}

      <p className="text-[11px] text-text-secondary leading-snug">
        <strong>Allergen Notice:</strong> Ingredient and allergen details for this item aren&apos;t
        published yet — please tell our team about any allergies before ordering.
      </p>
    </div>
  );
}

export default NutritionAllergenPanel;
