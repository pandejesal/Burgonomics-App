import * as React from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: "primary" | "success" | "warning" | "error" | "neutral";
}

export function AppBadge({ tone = "primary", className, ...rest }: BadgeProps) {
  const tones = {
    primary: "bg-primary text-primary-foreground",
    success: "bg-success text-success-foreground",
    warning: "bg-warning text-warning-foreground",
    error: "bg-error text-error-foreground",
    neutral: "bg-bg-secondary text-text-secondary",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full px-2 py-0.5 type-caption whitespace-nowrap shrink-0",
        tones,
        className,
      )}
      {...rest}
    />
  );
}
