import * as React from "react";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
  success?: boolean;
  autoFocus?: boolean;
  ariaLabel?: string;
}

export function OtpInput({
  length = 6,
  value,
  onChange,
  error,
  success,
  autoFocus,
  ariaLabel = "One-time passcode",
}: OtpInputProps) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([]);

  const setDigit = (idx: number, digit: string) => {
    const cleanDigits = digit.replace(/\D/g, "");
    if (cleanDigits.length > 1) {
      const text = cleanDigits.slice(0, length);
      onChange(text);
      refs.current[Math.min(text.length, length - 1)]?.focus();
      return;
    }
    const clean = cleanDigits.slice(-1);
    const next = (value + "").padEnd(length, " ").split("");
    next[idx] = clean || " ";
    const joined = next.join("").replace(/\s/g, "").slice(0, length);
    onChange(joined);
    if (clean && idx < length - 1) refs.current[idx + 1]?.focus();
  };

  const onKeyDown = (idx: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Prevent non-numeric characters that are allowed in type="number"
    if (["e", "E", "+", "-", "."].includes(e.key)) {
      e.preventDefault();
      return;
    }
    if (e.key === "Backspace" && !value[idx] && idx > 0) refs.current[idx - 1]?.focus();
    if (e.key === "ArrowLeft" && idx > 0) refs.current[idx - 1]?.focus();
    if (e.key === "ArrowRight" && idx < length - 1) refs.current[idx + 1]?.focus();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (text) {
      e.preventDefault();
      onChange(text);
      refs.current[Math.min(text.length, length - 1)]?.focus();
    }
  };

  return (
    <div role="group" aria-label={ariaLabel} className="flex items-center justify-between gap-2">
      {Array.from({ length }).map((_, idx) => {
        const digit = value[idx] ?? "";
        const state = error ? "error" : success ? "success" : digit ? "filled" : "default";
        const border = {
          default: "border-divider",
          filled: "border-text-primary",
          error: "border-error",
          success: "border-success",
        }[state];
        return (
          <input
            key={idx}
            ref={(el) => {
              refs.current[idx] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            aria-label={`Box ${idx + 1} of ${length}`}
            maxLength={1}
            value={digit}
            autoFocus={autoFocus && idx === 0}
            onChange={(e) => setDigit(idx, e.target.value)}
            onKeyDown={onKeyDown(idx)}
            onPaste={onPaste}
            className={cn(
              "h-14 w-12 rounded-[var(--radius-medium)] border-[1.5px] bg-surface text-center shadow-low float-interactive",
              "type-display-medium text-text-primary outline-none focus:border-primary",
              border,
            )}
          />
        );
      })}
    </div>
  );
}
