import * as React from "react";
import { cn } from "@/lib/utils";

interface Props {
  percent: number;
  size?: number;
  stroke?: number;
  label?: string;
}

/** Animated ring showing profile completion. Repository-driven value. */
export function CompletionRing({ percent, size = 56, stroke = 5, label }: Props) {
  const [display, setDisplay] = React.useState(0);
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setDisplay(percent));
    return () => cancelAnimationFrame(raf);
  }, [percent]);

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (display / 100) * circumference;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={label ?? `${percent}% profile complete`}
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="hsl(var(--divider))"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="hsl(var(--primary))"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("transition-[stroke-dashoffset] duration-700 ease-out")}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center type-caption text-text-secondary">
        {percent}%
      </span>
    </div>
  );
}
