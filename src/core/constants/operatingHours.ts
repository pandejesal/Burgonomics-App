/**
 * Kitchen Operating Hours — single source of truth.
 *
 * Burgonomics serves 11:00 AM – 11:00 PM, every day. Every ordering gate
 * (Menu, Cart, Checkout, payment preflight) reads this module; no screen may
 * hardcode "11" or "23" or re-derive the window, because a second schedule
 * is how the banner and the button drift apart.
 *
 * Hours are IST regardless of the device timezone: a handset set to UTC must
 * not see a kitchen that opens at 05:30 or one that never closes.
 */

/** IANA zone the kitchen schedule is expressed in. */
export const KITCHEN_TIME_ZONE = "Asia/Kolkata";

/** Opens 11:00 AM IST — minutes past midnight. */
export const KITCHEN_OPEN_MINUTES = 11 * 60;
/** Closes 11:00 PM IST — minutes past midnight. */
export const KITCHEN_CLOSE_MINUTES = 23 * 60;

export const KITCHEN_OPEN_LABEL = "11:00 AM";
export const KITCHEN_CLOSE_LABEL = "11:00 PM";

/**
 * Banner copy, defined once so Menu, Cart and Checkout can never disagree
 * about why the checkout button is disabled.
 */
export const KITCHEN_CLOSED_MESSAGE = `We are currently closed. Kitchen opens at ${KITCHEN_OPEN_LABEL}.`;

export interface KitchenHoursState {
  /** True while the kitchen is taking orders. */
  isOpen: boolean;
  /** Minutes past midnight IST right now. */
  minutesNow: number;
  /** Minutes until the kitchen opens. 0 while open. */
  minutesUntilOpen: number;
  /** Minutes until the kitchen closes. 0 while closed. */
  minutesUntilClose: number;
}

const MINUTES_PER_DAY = 24 * 60;

/**
 * Minutes past midnight in IST for the given instant.
 *
 * Falls back to the device's own clock only if the runtime has no usable
 * `Intl` timezone database — a wrong-by-a-few-hours schedule is still better
 * than a crashed menu on an exotic WebView.
 */
export function istMinutesSinceMidnight(now: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: KITCHEN_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);

    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    const minute = Number(parts.find((p) => p.type === "minute")?.value);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) throw new Error("bad parts");
    return hour * 60 + minute;
  } catch {
    return now.getHours() * 60 + now.getMinutes();
  }
}

/**
 * Resolves the kitchen's state at an instant.
 *
 * The window is [open, close): 11:00:00 is open, 22:59 is open, 23:00 is not.
 */
export function getKitchenHours(now: Date = new Date()): KitchenHoursState {
  const minutesNow = istMinutesSinceMidnight(now);
  const isOpen = minutesNow >= KITCHEN_OPEN_MINUTES && minutesNow < KITCHEN_CLOSE_MINUTES;

  if (isOpen) {
    return {
      isOpen: true,
      minutesNow,
      minutesUntilOpen: 0,
      minutesUntilClose: KITCHEN_CLOSE_MINUTES - minutesNow,
    };
  }

  // Before opening → the kitchen opens later today. At or after closing →
  // the next opening is tomorrow morning.
  const minutesUntilOpen =
    minutesNow < KITCHEN_OPEN_MINUTES
      ? KITCHEN_OPEN_MINUTES - minutesNow
      : MINUTES_PER_DAY - minutesNow + KITCHEN_OPEN_MINUTES;

  return { isOpen: false, minutesNow, minutesUntilOpen, minutesUntilClose: 0 };
}

/** Convenience predicate over {@link getKitchenHours}. */
export function isKitchenOpen(now: Date = new Date()): boolean {
  return getKitchenHours(now).isOpen;
}
