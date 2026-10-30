import * as React from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

interface Props {
  id?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  actionTo?: string;
  className?: string;
}

export function SectionHeader({ id, title, subtitle, actionLabel, actionTo, className }: Props) {
  return (
    <header className={cn("mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4", className)}>
      <div className="min-w-0 flex-1 basis-40">
        <h2 id={id} className="type-brand-heading text-xl leading-snug text-text-primary break-words">{title}</h2>
        {subtitle && <p className="mt-1 text-sm leading-relaxed text-text-secondary">{subtitle}</p>}
      </div>
      {actionLabel && actionTo && (
        <Link
          to={actionTo}
          className="inline-flex min-h-11 items-center rounded-md py-2 text-sm font-semibold text-primary-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {actionLabel}
        </Link>
      )}
    </header>
  );
}
