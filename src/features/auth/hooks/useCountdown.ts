import { useEffect, useState } from "react";

/**
 * Countdown timer for OTP resend. Returns remaining seconds and a
 * `reset()` fn — parent screens call `reset()` after a successful
 * resend to restart the cooldown.
 */
export function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining]);

  const reset = (next: number = seconds) => setRemaining(next);

  return { remaining, isDone: remaining <= 0, reset };
}
