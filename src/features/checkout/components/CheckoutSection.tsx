import * as React from "react";
import { Text } from "@/shared/components/common/Text";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * CheckoutSection — a labelled card used by every panel on the
 * Checkout screen so panels look and behave consistently regardless
 * of fulfillment method.
 */
export function CheckoutSection({ title, action, children, className }: Props) {
  const headingId = React.useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "rounded-[var(--radius-large)] border border-divider bg-surface p-4 shadow-low float-interactive",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1",
        className,
      )}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <Text id={headingId} variant="titleLarge">
          {title}
        </Text>
        {action}
      </header>
      {children}
    </section>
  );
}
