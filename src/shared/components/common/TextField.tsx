import * as React from "react";
import { cn } from "@/lib/utils";

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helper?: string;
  error?: string;
  success?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, helper, error, success, iconLeft, iconRight, id, className, ...rest }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const helperId = `${inputId}-helper`;
    const state = error ? "error" : success ? "success" : "default";
    const borderColor = {
      default: "border-divider focus-within:border-primary",
      error: "border-error",
      success: "border-success",
    }[state];
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        <label htmlFor={inputId} className="type-caption text-text-secondary uppercase">
          {label}
        </label>
        <div
          className={cn(
            "flex items-center gap-2 min-h-[56px] rounded-[var(--radius-medium)] border-[1.5px] bg-surface px-4 cursor-text",
            "transition-colors",
            borderColor,
          )}
          onClick={(e) => {
            const input = e.currentTarget.querySelector("input");
            if (input && document.activeElement !== input) {
              input.focus();
            }
          }}
        >
          {iconLeft}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={!!error || undefined}
            aria-describedby={helper || error ? helperId : undefined}
            className={cn(
              "flex-1 bg-transparent outline-none type-body-large text-text-primary placeholder:text-text-disabled min-w-0 font-medium h-full py-4",
            )}
            {...rest}
          />
          {iconRight}
        </div>
        {(helper || error) && (
          <span
            id={helperId}
            className={cn("type-caption", error ? "text-error" : "text-text-secondary")}
          >
            {error ?? helper}
          </span>
        )}
      </div>
    );
  },
);
TextField.displayName = "TextField";
