import * as React from "react";
import { ShieldCheck, Leaf, Sparkles, HeartHandshake } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrustSectionProps {
  className?: string;
}

export function TrustSection({ className }: TrustSectionProps) {
  const guarantees = [
    {
      Icon: Leaf,
      title: "100% Pure Vegetarian",
      description: "Dedicated pure veg kitchen with zero cross-contamination risk.",
    },
    {
      Icon: Sparkles,
      title: "Chef-Crafted Patties",
      description: "Artisanal potato, paneer & crisp vegetable smash patties.",
    },
    {
      Icon: HeartHandshake,
      title: "Farm-Fresh Daily",
      description: "Freshly baked brioche buns & farm-sourced gourmet toppings.",
    },
  ];

  return (
    <section className={cn("px-4 py-2", className)} aria-label="Quality Guarantees">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-low">
        {/* Header with Mascot */}
        <div className="flex items-center justify-between gap-3 mb-3 border-b border-border/60 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-600">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-sans text-xs font-bold uppercase tracking-wider text-text-primary">
                Burgonomics Pure Veg Promise
              </h3>
              <p className="text-[10px] text-text-secondary">
                Certified 100% Pure Veg QSR standard
              </p>
            </div>
          </div>

          {/* Burgonomics Mascot badge */}
          <div className="flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-1">
            <img
              src="/burgonomics-logo.png"
              alt="Burgonomics Mascot"
              className="h-5 w-5 object-contain"
            />
            <span className="text-[10px] font-extrabold text-primary uppercase">Mascot Approved</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {guarantees.map(({ Icon, title, description }) => (
            <div
              key={title}
              className="flex items-start gap-2.5 rounded-xl bg-bg-secondary/60 p-2.5 border border-border/40"
            >
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <h4 className="font-sans text-xs font-bold text-text-primary">
                  {title}
                </h4>
                <p className="text-[11px] text-text-secondary leading-snug mt-0.5">
                  {description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
