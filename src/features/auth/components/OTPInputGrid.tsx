import * as React from "react";
import { useEffect, useRef, useState } from "react";
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

const isDigit = (slot: string | undefined): boolean => Boolean(slot) && /^\d$/.test(slot as string);

/**
 * Fixed-length slot model: every box owns one position, so clearing a middle
 * digit leaves the later boxes where the user typed them. The old string
 * rebuild collapsed holes and silently shifted digits left, which produced a
 * valid-looking but wrong code.
 */
function toSlots(value: string, length: number): string[] {
  return Array.from({ length }, (_, index) => (isDigit(value[index]) ? value[index] : ""));
}

/**
 * Six-digit OTP input grid:
 * - Auto-forward cursor advance, backspace retreat, arrow navigation
 * - Paste / autofill fills from the focused box
 * - WebOTP auto-read fills only; completion is decided in one place so a late
 *   WebOTP callback and the final keystroke cannot both submit
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
  const [slots, setSlots] = useState<string[]>(() => toSlots(value, length));
  const slotsRef = useRef<string[]>(slots);
  const lastEmitted = useRef(value);
  const completionFired = useRef(false);
  const mountedRef = useRef(true);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);
  onChangeRef.current = onChange;
  disabledRef.current = disabled;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Adopt external value changes (parent reset / new challenge) but never our
  // own echo, or a controlled parent would rewrite the grid on every keystroke.
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    const next = toSlots(value, length);
    slotsRef.current = next;
    setSlots(next);
  }, [value, length]);

  const emit = (next: string[]): string => {
    slotsRef.current = next;
    setSlots(next);
    // Emit POSITIONAL text: an empty slot becomes a space (trailing ones
    // trimmed). Filtering holes out shifted every later digit one place on the
    // next mount, because toSlots can only restore positions it is given.
    const joined = next
      .map((slot) => (isDigit(slot) ? slot : " "))
      .join("")
      .replace(/\s+$/, "");
    if (joined !== lastEmitted.current) {
      lastEmitted.current = joined;
      onChangeRef.current(joined);
    }
    return joined;
  };

  const applyFrom = (startIndex: number, text: string): void => {
    const digits = text.replace(/\D/g, "");
    if (!digits) return;
    const next = [...slotsRef.current];
    const chars = digits.split("");
    for (let offset = 0; offset < chars.length && startIndex + offset < length; offset += 1) {
      next[startIndex + offset] = chars[offset];
    }
    emit(next);
    inputRefs.current[Math.min(startIndex + chars.length, length - 1)]?.focus();
  };

  // Single completion authority: fires only for a fully filled grid of real
  // digits, never while disabled, and never twice for the same filled state.
  useEffect(() => {
    const complete = slots.length === length && slots.every(isDigit);
    if (!complete) {
      completionFired.current = false;
      return;
    }
    if (disabled || completionFired.current) return;
    completionFired.current = true;
    onComplete?.(slots.join(""));
  }, [slots, length, disabled, onComplete]);

  // WebOTP: fill only. Completion is left to the effect above.
  useEffect(() => {
    if (typeof window === "undefined" || !("credentials" in navigator)) return;

    const abortController = new AbortController();
    try {
      (navigator.credentials as any)
        .get({ otp: { transport: ["sms"] }, signal: abortController.signal })
        .then((content: any) => {
          if (!mountedRef.current || disabledRef.current) return;
          const code = String(content?.code ?? "").replace(/\D/g, "").slice(0, length);
          if (code.length !== length) return;
          const next = Array.from({ length }, (_, index) => code[index]);
          emit(next);
        })
        .catch(() => {
          // Aborted, unsupported or timed out — manual entry continues.
        });
    } catch {
      // Ignore unsupported browser environments.
    }

    return () => abortController.abort();
  }, [length]);

  const handleDigitChange = (index: number, rawInput: string) => {
    const digits = rawInput.replace(/\D/g, "");

    if (!digits) {
      // Explicit clear of this slot: keep later slots exactly where they are.
      const next = [...slotsRef.current];
      next[index] = "";
      emit(next);
      return;
    }

    if (digits.length > 1) {
      // Paste / autofill arriving in one box — start at the focused slot.
      applyFrom(index, digits);
      return;
    }

    const next = [...slotsRef.current];
    next[index] = digits.slice(-1);
    emit(next);

    if (index < length - 1) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (["e", "E", "+", "-", "."].includes(e.key)) {
      e.preventDefault();
      return;
    }

    if (e.key === "Backspace" && !slotsRef.current[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowRight" && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (index: number) => (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasteText = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasteText) return;
    e.preventDefault();
    applyFrom(index, pasteText);
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex items-center justify-between gap-2.5 sm:gap-3 my-2"
    >
      {Array.from({ length }).map((_, idx) => {
        const digit = slots[idx] ?? "";
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
            onPaste={handlePaste(idx)}
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
