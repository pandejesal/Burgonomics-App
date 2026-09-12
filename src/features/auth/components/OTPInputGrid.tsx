import * as React from "react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface OTPInputGridProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (code: string) => void;
  error?: boolean;
  success?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}

/**
 * Enterprise 6-digit OTP input grid matching Domino's / La Pino'z UX parity:
 * - Auto-forward cursor advance
 * - Backspace retreat
 * - Arrow navigation
 * - Full clipboard paste support
 * - Native WebOTP API auto-read for SMS verification on supported devices
 */
export function OTPInputGrid({
  length = 6,
  value,
  onChange,
  onComplete,
  error,
  success,
  autoFocus = true,
  disabled = false,
  ariaLabel = "One-time passcode",
}: OTPInputGridProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const hasTriggeredComplete = useRef(false);

  // 1. WebOTP API: Auto-read SMS OTP on supported browsers (Chrome on Android)
  useEffect(() => {
    if (typeof window === "undefined" || !("credentials" in navigator)) {
      return;
    }

    const abortController = new AbortController();

    try {
      (navigator.credentials as any)
        .get({
          otp: { transport: ["sms"] },
          signal: abortController.signal,
        })
        .then((content: any) => {
          if (content && content.code) {
            const rawCode = content.code.replace(/\D/g, "").slice(0, length);
            if (rawCode.length === length) {
              onChange(rawCode);
              if (onComplete) {
                onComplete(rawCode);
              }
            }
          }
        })
        .catch((_err: any) => {
          // WebOTP aborted or not supported/timed out, graceful fallback
        });
    } catch {
      // Ignore unsupported browser environments
    }

    return () => {
      abortController.abort();
    };
  }, [length, onChange, onComplete]);

  // 2. Trigger onComplete callback once all digits are entered
  useEffect(() => {
    const cleanValue = value.replace(/\D/g, "");
    if (cleanValue.length === length) {
      if (!hasTriggeredComplete.current) {
        hasTriggeredComplete.current = true;
        if (onComplete) {
          onComplete(cleanValue);
        }
      }
    } else {
      hasTriggeredComplete.current = false;
    }
  }, [value, length, onComplete]);

  const handleDigitChange = (idx: number, rawInput: string) => {
    const cleanDigits = rawInput.replace(/\D/g, "");

    // Multi-digit paste or autofill in a single box
    if (cleanDigits.length > 1) {
      const text = cleanDigits.slice(0, length);
      onChange(text);
      const targetFocusIdx = Math.min(text.length, length - 1);
      inputRefs.current[targetFocusIdx]?.focus();
      return;
    }

    const singleDigit = cleanDigits.slice(-1);
    const charArray = (value + "").padEnd(length, " ").split("");
    charArray[idx] = singleDigit || " ";
    const updated = charArray.join("").replace(/\s/g, "").slice(0, length);
    onChange(updated);

    // Auto-advance forward to next box if digit entered
    if (singleDigit && idx < length - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handleKeyDown = (idx: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Block non-numeric characters that might slip through
    if (["e", "E", "+", "-", "."].includes(e.key)) {
      e.preventDefault();
      return;
    }

    // Backspace retreat to previous input box if current box is empty
    if (e.key === "Backspace") {
      if (!value[idx] && idx > 0) {
        inputRefs.current[idx - 1]?.focus();
      }
    }

    // Arrow navigation
    if (e.key === "ArrowLeft" && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
    if (e.key === "ArrowRight" && idx < length - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasteText = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (pasteText) {
      e.preventDefault();
      onChange(pasteText);
      const targetFocusIdx = Math.min(pasteText.length, length - 1);
      inputRefs.current[targetFocusIdx]?.focus();
    }
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex items-center justify-between gap-2.5 sm:gap-3 my-2"
    >
      {Array.from({ length }).map((_, idx) => {
        const digit = value[idx] ?? "";
        const isFilled = Boolean(digit);
        const borderClass = error
          ? "border-error focus:border-error ring-1 ring-error/20"
          : success
          ? "border-success focus:border-success ring-1 ring-success/20"
          : isFilled
          ? "border-primary focus:border-primary"
          : "border-divider focus:border-primary";

        return (
          <input
            key={idx}
            ref={(el) => {
              inputRefs.current[idx] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            aria-label={`Box ${idx + 1} of ${length}`}
            maxLength={1}
            value={digit}
            disabled={disabled}
            autoFocus={autoFocus && idx === 0}
            onChange={(e) => handleDigitChange(idx, e.target.value)}
            onKeyDown={handleKeyDown(idx)}
            onPaste={handlePaste}
            className={cn(
              "h-14 w-12 sm:w-14 rounded-[var(--radius-medium)] border-[1.5px] bg-surface text-center shadow-low float-interactive transition-colors",
              "type-display-medium font-semibold text-text-primary outline-none",
              borderClass,
              disabled && "opacity-60 cursor-not-allowed"
            )}
          />
        );
      })}
    </div>
  );
}
