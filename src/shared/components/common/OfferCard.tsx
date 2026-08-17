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
          className="mt-1 line-clamp-2 text-xs leading-normal"
        >
          {description}
        </Text>
        <div className="mt-3 flex items-center justify-between">
          <span className="rounded-lg bg-accent/5 border border-dashed border-accent/40 px-2.5 py-1 type-caption text-accent font-bold">
            {code}
          </span>
          <button
            type="button"
            onClick={() => onApply?.(code)}
            className="rounded-full bg-accent text-accent-foreground px-4 py-1.5 text-xs font-bold shadow-sm hover:brightness-110 active:scale-95 transition-all duration-200"
          >
            APPLY
          </button>
        </div>
      </div>
    </AppCard>
  );
}
