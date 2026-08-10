import * as React from "react";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "motion/react";

interface CardProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart"
> {
  elevation?: "flat" | "low" | "medium" | "high";
  padded?: boolean;
  interactive?: boolean;
}

export function AppCard({
  elevation = "low",
  padded = true,
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  const [mounted, setMounted] = React.useState(false);
  const shouldReduceMotion = useReducedMotion();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const shadowClasses = {
    flat: "shadow-none",
    low: "shadow-[var(--shadow-low)]",
    medium: "shadow-[var(--shadow-medium)]",
    high: "shadow-[var(--shadow-high)]",
  };

  const shadow = shadowClasses[elevation];
  const cardClassName = cn(
    "bg-surface/90 backdrop-blur-md rounded-[var(--radius-large)] border border-divider/50",
    shadow,
    padded && "p-4",
    className,
  );

  const hasReducedMotion = mounted ? shouldReduceMotion : false;

  // If reduced motion is preferred or if it is not interactive, use standard div
  if (hasReducedMotion || !interactive) {
    return (
      <div className={cardClassName} {...rest}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={cardClassName}
      whileTap={{
        scale: 0.98,
        y: 1,
        boxShadow: "0px 2px 4px rgba(0, 0, 0, 0.04)", // physically flattens towards background
      }}
      transition={{
        type: "spring",
        stiffness: 450,
        damping: 25,
      }}
      style={{ willChange: "transform" }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
