import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  actionTo?: string;
  className?: string;
}

export function SectionHeader({ title, subtitle, actionLabel, actionTo, className }: Props) {
  return (
    <header className={cn("mb-3 flex items-end justify-between gap-3 px-4", className)}>
      <div className="min-w-0">
        <h2 className="type-headline-medium truncate">{title}</h2>
        {subtitle && <p className="type-body-medium text-text-secondary mt-0.5">{subtitle}</p>}
      </div>
      {actionLabel && actionTo && (
        <Link
          to={actionTo}
          className="inline-flex shrink-0 items-center gap-0.5 type-label-large text-primary hover:underline"
        >
          {actionLabel}
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </header>
  );
}
