import * as React from "react";
import { Loader2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";
import { AudioService } from "@/core/services/audio";
import { isIOS } from "@/shared/platform/platform";

/**
 * ButtonPrimary — design-system button per 03_Design_System §19.
 * Wraps shadcn semantics with token-based variants, loading lock, and premium haptic feedback.
 */

type Variant = "primary" | "secondary" | "outlined" | "ghost" | "danger" | "cta";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground shadow-[var(--shadow-low)] hover:brightness-105",
  secondary:
    "bg-surface text-primary-text border-2 border-primary shadow-[var(--shadow-low)] hover:bg-primary/5 dark:bg-surface-elevated",
  outlined: "bg-transparent text-primary-text border-2 border-primary hover:bg-primary/5",
  ghost: "bg-transparent text-primary-text hover:bg-primary/5",
  danger: "bg-error text-white shadow-[var(--shadow-low)] hover:brightness-110",
  cta: "bg-accent text-accent-foreground shadow-[var(--shadow-brand)] hover:brightness-110",
};

const sizes: Record<Size, string> = {
  sm: "min-h-[40px] px-4 text-sm",
  md: "min-h-[48px] px-6 text-base",
  lg: "min-h-[56px] px-8 text-base",
};

export interface AppButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart"
> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const AppButton = React.forwardRef<HTMLButtonElement, AppButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading,
      disabled,
      iconLeft,
      iconRight,
      fullWidth,
      className,
      children,
      onClick,
      ...rest
    },
    ref,
  ) => {
    const [mounted, setMounted] = React.useState(false);
    const shouldReduceMotion = useReducedMotion();

    React.useEffect(() => {
      setMounted(true);
    }, []);

    const hasReducedMotion = mounted ? shouldReduceMotion : false;
    const isDisabled = disabled || loading;
    const ios = isIOS();

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!isDisabled) {
        HapticService.impact(variant === "primary" ? "medium" : "light");
        AudioService.playClick();
      }
      onClick?.(e);

      if (rest.type === "submit" && !e.defaultPrevented) {
        const form = e.currentTarget.closest("form");
        if (form) {
          // Fire a synthetic submit event to ensure onSubmit is triggered
          const submitEvent = new Event("submit", { cancelable: true, bubbles: true });
          form.dispatchEvent(submitEvent);
        }
      }
    };

    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        data-vaul-no-drag
        aria-busy={loading || undefined}
        aria-disabled={isDisabled || undefined}
        disabled={isDisabled}
        onClick={handleClick}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-full font-semibold relative overflow-hidden touch-manipulation select-none cursor-pointer active:scale-[0.98]",
          "transition-all duration-200 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:opacity-40 disabled:pointer-events-none",
          !isDisabled && !hasReducedMotion && !ios && "active:scale-95",
          variants[variant],
          sizes[size],
          fullWidth && "w-full",
          variant === "ghost" && "rounded-md",
          ios && !isDisabled && "active:opacity-70",
          className,
        )}
        style={{ touchAction: "manipulation" }}
        type={rest.type || "button"}
        {...rest}
      >
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        ) : (
          <>
            {iconLeft}
            <span>{children}</span>
            {iconRight}
          </>
        )}
      </button>
    );
  },
);
AppButton.displayName = "AppButton";
