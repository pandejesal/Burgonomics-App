import * as React from "react";
import { Check, Circle, X, Bike } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { Text } from "@/shared/components/common/Text";
import type { OrderTimelineStep } from "@/features/orders/models";

interface Props {
  steps: OrderTimelineStep[];
  /** When true, render step icons with the cancelled tone. */
  cancelled?: boolean;
  className?: string;
}

/**
 * OrderTimeline — accessible vertical progress list.
 * Upgraded with premium micro-animated scooter tracking and infinite radar pulsing rumbles.
 */
export function OrderTimeline({ steps, cancelled, className }: Props) {
  // Find the active step index
  const activeStepIdx = steps.findIndex((s) => s.state === "current");
  const fallbackIdx =
    activeStepIdx !== -1 ? activeStepIdx : steps.filter((s) => s.state === "completed").length - 1;
  const currentStepIndex = Math.max(0, fallbackIdx);
  const progressPercent = steps.length > 1 ? (currentStepIndex / (steps.length - 1)) * 100 : 0;

  return (
    <div className={cn("space-y-6", className)}>
      {/* Horizontal Micro-Animation Track */}
      {!cancelled && steps.length > 1 && (
        <div
          className="mb-6 rounded-2xl bg-bg-secondary p-4 flex flex-col gap-4 relative overflow-hidden"
          aria-hidden="true"
        >
          <div className="flex justify-between items-center px-1">
            <span className="type-caption font-bold text-text-secondary">Live Tracker</span>
            <span className="type-caption font-mono text-primary font-bold bg-primary/10 px-2.5 py-0.5 rounded-full">
              {Math.round(progressPercent)}%
            </span>
          </div>

          <div className="relative h-8 flex items-center">
            {/* Visual background road track */}
            <div className="absolute inset-x-2 h-1.5 bg-divider rounded-full" />

            {/* Filled completed path */}
            <motion.div
              className="absolute h-1.5 bg-gradient-to-r from-primary to-orange-500 rounded-full left-2"
              initial={{ width: 0 }}
              animate={{ width: `calc(${progressPercent}% - 8px)` }}
              transition={{ type: "spring", stiffness: 60, damping: 18 }}
            />

            {/* Track milestones / nodes */}
            {steps.map((_, i) => {
              const nodePercent = (i / (steps.length - 1)) * 100;
              const isPassed = i <= currentStepIndex;
              return (
                <div
                  key={i}
                  className="absolute z-10 w-3 h-3 rounded-full border-2 transform -translate-x-1/2 transition-colors duration-500"
                  style={{
                    left: `calc(${nodePercent}% - ${i === 0 ? -6 : i === steps.length - 1 ? 6 : 0}px)`,
                    borderColor: isPassed ? "var(--color-primary)" : "var(--color-divider)",
                    backgroundColor: isPassed ? "var(--color-primary)" : "var(--color-surface)",
                  }}
                />
              );
            })}

            {/* Scooter / Delivery icon micro-animator */}
            <motion.div
              className="absolute z-20 w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-[var(--shadow-brand)]"
              initial={{ left: "0%" }}
              animate={{ left: `calc(${progressPercent}% - 16px)` }}
              transition={{ type: "spring", stiffness: 50, damping: 13 }}
            >
              <Bike className="h-4 w-4 animate-bounce" style={{ animationDuration: "1.2s" }} />
            </motion.div>
          </div>

          {/* Milestone labels */}
          <div className="flex justify-between items-center text-[10px] font-semibold uppercase tracking-wider text-text-secondary px-1">
            {steps.map((s, idx) => (
              <span
                key={idx}
                className={cn(
                  "truncate max-w-[65px] text-center",
                  idx <= currentStepIndex
                    ? "text-primary font-bold"
                    : "text-text-secondary opacity-75",
                )}
              >
                {s.code === "READY_FOR_PICKUP"
                  ? "Ready"
                  : s.code === "OUT_FOR_DELIVERY"
                    ? "Transit"
                    : s.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Vertical Steps */}
      <ol className="relative space-y-5" aria-label="Order progress">
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1;
          const state = cancelled ? "future" : step.state;
          return (
            <li
              key={`${step.code}-${idx}`}
              className="relative flex gap-4"
              aria-current={state === "current" ? "step" : undefined}
            >
              {/* Connector line */}
              {!isLast && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-[15px] top-[26px] h-[calc(100%-14px)] w-[2px] -translate-x-1/2 rounded-full transition-colors duration-300",
                    state === "completed" ? "bg-success" : "bg-divider",
                  )}
                />
              )}

              {/* Icon Container with Radar pulse */}
              <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center">
                {state === "current" && !cancelled && (
                  <>
                    {/* Inner Pulse ring */}
                    <motion.div
                      className="absolute inset-0 rounded-full bg-primary/30"
                      animate={{ scale: [1, 1.8], opacity: [0.8, 0] }}
                      transition={{
                        repeat: Infinity,
                        duration: 1.8,
                        ease: "easeOut",
                      }}
                    />
                    {/* Outer Staggered radar ring */}
                    <motion.div
                      className="absolute inset-0 rounded-full bg-primary/20"
                      animate={{ scale: [1, 2.5], opacity: [0.5, 0] }}
                      transition={{
                        repeat: Infinity,
                        duration: 1.8,
                        delay: 0.6,
                        ease: "easeOut",
                      }}
                    />
                  </>
                )}
                <span
                  aria-hidden
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-full border-2 transition-all duration-300",
                    cancelled
                      ? "border-error/30 bg-error/10 text-error"
                      : state === "completed"
                        ? "border-success bg-success text-success-foreground"
                        : state === "current"
                          ? "border-primary bg-primary text-primary-foreground font-bold shadow-md"
                          : "border-divider bg-surface text-text-disabled",
                  )}
                >
                  {cancelled ? (
                    <X className="h-4 w-4" />
                  ) : state === "completed" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Circle
                      className={cn(
                        "h-1.5 w-1.5",
                        state === "current" ? "fill-current scale-125" : "fill-current",
                      )}
                    />
                  )}
                </span>
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex items-baseline justify-between gap-2 min-w-0">
                  <Text
                    variant="titleMedium"
                    tone={cancelled ? "secondary" : state === "future" ? "secondary" : "primary"}
                    className="truncate font-semibold"
                  >
                    {step.title}
                  </Text>
                  {step.timestamp && (
                    <Text variant="caption" tone="secondary" className="shrink-0 tabular-nums">
                      {formatTime(step.timestamp)}
                    </Text>
                  )}
                </div>
                {step.description && (
                  <Text variant="bodyMedium" tone="secondary" className="mt-0.5 leading-normal">
                    {step.description}
                  </Text>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
