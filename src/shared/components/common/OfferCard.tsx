import * as React from "react";
import { AppCard } from "./AppCard";
import { Text } from "./Text";
import { Ticket } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OfferCardProps {
  code: string;
  title: string;
  description: string;
  onApply?: (code: string) => void;
  className?: string;
}

export function OfferCard({ code, title, description, onApply, className }: OfferCardProps) {
  return (
    <AppCard
      elevation="medium"
      padded
      className={cn(
        "border border-accent/20 bg-surface rounded-[18px] hover:border-accent/40 transition-all duration-300",
        "flex items-start gap-4",
        className,
      )}
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
        <Ticket className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <Text variant="titleMedium" className="text-text-primary font-bold">
          {title}
        </Text>
        <Text
          variant="bodyMedium"
          tone="secondary"
          className="mt-1 line-clamp-2 text-sm leading-relaxed"
        >
          {description}
        </Text>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="rounded-lg border border-dashed border-accent/40 bg-accent/5 px-2.5 py-1 type-caption font-semibold text-accent">
            {code}
          </span>
          <button
            type="button"
            onClick={() => onApply?.(code)}
            className="min-h-11 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover active:scale-95"
          >
            Apply
          </button>
        </div>
      </div>
    </AppCard>
  );
}
