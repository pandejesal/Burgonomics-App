import * as React from "react";
import { getKitchenHours, type KitchenHoursState } from "@/core/constants/operatingHours";

/** Re-check cadence. Boundary precision only needs to be better than a minute. */
const TICK_MS = 30_000;

/**
 * Live kitchen-hours state.
 *
 * Menus and checkout screens stay open across the 11:00 / 23:00 boundaries, so
 * a value computed once at mount goes stale and leaves the checkout button
 * enabled after closing time. This re-reads on a 30s tick and on tab focus so
 * a screen left open overnight re-locks itself when the customer returns.
 */
export function useKitchenHours(now: Date = new Date()): KitchenHoursState {
  const [state, setState] = React.useState<KitchenHoursState>(() => getKitchenHours(now));

  React.useEffect(() => {
    const refresh = () => setState(getKitchenHours());
    refresh();

    const interval = setInterval(refresh, TICK_MS);
    // Coming back from a backgrounded WebView is the common case (app
    // backgrounded over the boundary, then resumed) — recheck immediately.
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return state;
}
