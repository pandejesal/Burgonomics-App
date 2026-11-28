/**
 * Outlet ordering hours — single source of truth.
 *
 * An outlet's OWN configured hours decide when customers can order. The
 * customer app and the Cloud Functions backend run the same resolver over the
 * same precedence:
 *
 *   staff close (`storeStatusOverride` / `isOpen: false`)
 *     → `stores/{id}.hours`
 *     → `admin_stores/{id}.hours`
 *     → `branches/{id}.operatingHours`
 *     → documented default 11:00 AM – 11:00 PM IST.
 *
 * Hours are always interpreted in Asia/Kolkata, regardless of the device
 * timezone. A handset set to UTC must not see the kitchen open at 05:30.
 * Overnight windows (`close < open`) are supported. Malformed hours fall back
 * to the next source, then the documented default, and warn once — the gate
 * never crashes because an outlet has a bad document.
 */

/** IANA zone every configured schedule is expressed in. */
export const KITCHEN_TIME_ZONE = "Asia/Kolkata";

/** Documented fallback: 11:00 AM IST, minutes past midnight. */
export const KITCHEN_OPEN_MINUTES = 11 * 60;
/** Documented fallback: 11:00 PM IST, minutes past midnight. */
export const KITCHEN_CLOSE_MINUTES = 23 * 60;

export const KITCHEN_OPEN_LABEL = "11:00 AM";
export const KITCHEN_CLOSE_LABEL = "11:00 PM";

/** Legacy constant: the default-window message, still used by older copy. */
export const KITCHEN_CLOSED_MESSAGE = `We are currently closed. Kitchen opens at ${KITCHEN_OPEN_LABEL}.`;
/** A staff close is not a schedule — never tell a customer when it will end. */
export const KITCHEN_CLOSED_BY_STAFF_MESSAGE =
  "This outlet is closed by staff right now. Online orders can't be placed. Please try again later.";

/** Which document supplied the window actually used for this verdict. */
export type OutletHoursSource = "staff" | "store" | "admin_store" | "branch" | "default";

export interface KitchenHoursState {
  /** True while the outlet is taking online orders. */
  isOpen: boolean;
  /** Minutes past midnight IST right now. */
  minutesNow: number;
  /** Minutes until the kitchen opens. 0 while open. */
  minutesUntilOpen: number;
  /** Minutes until the kitchen closes. 0 while closed. */
  minutesUntilClose: number;
  /** The resolved opening source; `"staff"` means a manual close won. */
  source: OutletHoursSource;
  /** Resolved opening time in 12-hour form, e.g. `"08:00 AM"`. */
  openLabel: string;
  /** Resolved closing time in 12-hour form, e.g. `"11:00 PM"`. */
  closeLabel: string;
  /** True only for a staff/manual close, never for a schedule gap. */
  closedByStaff: boolean;
}

/** Documents the pure resolver is allowed to consider. */
export interface OutletHoursDocuments {
  /** `stores/{id}` (the customer-facing storefront). */
  store?: any | null;
  /** `admin_stores/{id}` — the partner directory mirror. */
  adminStore?: any | null;
  /** `branches/{id}` — may carry staff flags and `operatingHours`. */
  branch?: any | null;
  /** Injectable clock; defaults to now. */
  now?: Date;
}

const MINUTES_PER_DAY = 24 * 60;
let defaultHoursWarningLogged = false;

/** Test-only: clear the once-per-process fallback warning latch. */
export function resetDefaultHoursWarningForTests(): void {
  defaultHoursWarningLogged = false;
}

function logDefaultHoursOnce(reason: string): void {
  if (defaultHoursWarningLogged) return;
  defaultHoursWarningLogged = true;
  console.warn(
    `[outletHours] ${reason}; using documented default ${KITCHEN_OPEN_LABEL}–${KITCHEN_CLOSE_LABEL} IST.`,
  );
}

/**
 * Parses `"11:00 AM"`, `"08:00"`, `"23:30"` into minutes past midnight.
 * Returns `null` for anything else — a bad document must never crash a menu.
 *
 * Exported because two storefront components print a stored hours value
 * directly to the customer, and the database legitimately contains BOTH
 * formats (measured 28 Nov 2026: `stores/demo.hours` and all 25
 * `branches/*.operatingHours` use 12-hour, while `stores/str_003.hours` used
 * 24-hour). Printing the raw string therefore showed "closes at 11:00 PM" on
 * one card and "closes at 23:30" on the next.
 */
export function parseHourMinute(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i.exec(value);
  if (!match) return null;
  const rawHour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  if (!Number.isInteger(rawHour) || !Number.isInteger(minute) || minute < 0 || minute > 59)
    return null;
  const meridiem = match[3]?.toLowerCase();
  let hour = rawHour;
  if (meridiem) {
    if (rawHour < 1 || rawHour > 12) return null;
    hour = (rawHour % 12) + (meridiem === "pm" ? 12 : 0);
  } else if (rawHour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

function formatHourMinute(minutes: number): string {
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const suffix = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 || 12;
  return `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/**
 * Normalises any stored hours string to the 12-hour form the rest of the UI
 * speaks (`"11:00 PM"`), or returns the input unchanged when it cannot be
 * parsed — a display helper must never blank out a real value.
 *
 * Storefront cards used to interpolate the raw document string, so a shop
 * storing 24-hour hours printed "closes at 23:30" beside a shop printing
 * "closes at 11:00 PM". This is the one place that fixes the boundary.
 */
export function formatStoredHour(value: unknown): string {
  const minutes = parseHourMinute(value);
  return minutes === null ? (typeof value === "string" ? value : "") : formatHourMinute(minutes);
}

interface ParsedHours {
  open: number;
  close: number;
}

/** Reads one document's hours field; malformed values are treated as absent. */
function parseConfiguredHours(doc: any, field: "hours" | "operatingHours"): ParsedHours | null {
  const raw = doc && typeof doc === "object" ? (doc as any)[field] : null;
  if (!raw || typeof raw !== "object") return null;
  const open = parseHourMinute((raw as any).open);
  const close = parseHourMinute((raw as any).close);
  if (open === null || close === null || open === close) return null;
  return { open, close };
}

/** Resolves the correct message for a closed outlet without inventing a time for a staff close. */
export function kitchenClosedMessage(
  state: Pick<KitchenHoursState, "closedByStaff" | "openLabel">,
): string {
  return state.closedByStaff
    ? KITCHEN_CLOSED_BY_STAFF_MESSAGE
    : `We are currently closed. Kitchen opens at ${state.openLabel}.`;
}

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
 * The one pure ordering-gate resolver, shared (same algorithm and vectors) with
 * the backend. Staff closes win before any hours; hours are then read in
 * store → admin_store → branch order, with the documented default last.
 */
export function resolveOutletOpenState(docs: OutletHoursDocuments = {}): KitchenHoursState {
  const now = docs.now instanceof Date && !Number.isNaN(docs.now.getTime()) ? docs.now : new Date();
  const minutesNow = istMinutesSinceMidnight(now);

  const store = docs.store && typeof docs.store === "object" ? docs.store : null;
  const adminStore =
    docs.adminStore && typeof docs.adminStore === "object" ? docs.adminStore : null;
  const branch = docs.branch && typeof docs.branch === "object" ? docs.branch : null;

  let hours: ParsedHours = { open: KITCHEN_OPEN_MINUTES, close: KITCHEN_CLOSE_MINUTES };
  let source: OutletHoursSource = "default";
  // A configured-but-unparseable schedule is unsafe, not a reason to let a
  // customer order on the documented fallback window (triage decision).
  let malformedHours = false;

  const storeHours = parseConfiguredHours(store, "hours");
  const adminHours = parseConfiguredHours(adminStore, "hours");
  const branchHours = parseConfiguredHours(branch, "operatingHours");
  if (storeHours) {
    hours = storeHours;
    source = "store";
  } else if (adminHours) {
    hours = adminHours;
    source = "admin_store";
  } else if (branchHours) {
    hours = branchHours;
    source = "branch";
  } else {
    const hasBadField =
      (store && store.hours != null) ||
      (adminStore && adminStore.hours != null) ||
      (branch && branch.operatingHours != null);
    malformedHours = hasBadField;
    if (hasBadField) logDefaultHoursOnce("configured hours could not be parsed");
    else logDefaultHoursOnce("no configured hours were found");
  }

  const closedByStaff =
    store?.storeStatusOverride === true ||
    branch?.storeStatusOverride === true ||
    store?.isOpen === false;
  const overnight = hours.close < hours.open;
  const scheduleOpen = overnight
    ? minutesNow >= hours.open || minutesNow < hours.close
    : minutesNow >= hours.open && minutesNow < hours.close;
  const isOpen = !closedByStaff && !malformedHours && scheduleOpen;

  let minutesUntilOpen = 0;
  let minutesUntilClose = 0;
  if (isOpen) {
    minutesUntilClose =
      overnight && minutesNow < hours.close
        ? hours.close - minutesNow
        : MINUTES_PER_DAY - minutesNow + hours.close;
  } else if (overnight) {
    minutesUntilOpen =
      minutesNow >= hours.close && minutesNow < hours.open
        ? hours.open - minutesNow
        : MINUTES_PER_DAY - minutesNow + hours.open;
  } else {
    // Before opening → later today. At/after close → tomorrow morning.
    minutesUntilOpen =
      minutesNow < hours.open ? hours.open - minutesNow : MINUTES_PER_DAY - minutesNow + hours.open;
  }

  return {
    isOpen,
    minutesNow,
    minutesUntilOpen,
    minutesUntilClose,
    source: closedByStaff ? "staff" : source,
    openLabel: formatHourMinute(hours.open),
    closeLabel: formatHourMinute(hours.close),
    closedByStaff,
  };
}

/**
 * Legacy default-window view over {@link resolveOutletOpenState}. Kept so
 * callers that do not pass outlet documents still see the documented 11–23
 * window rather than a second hand-written schedule.
 */
export function getKitchenHours(now: Date = new Date()): KitchenHoursState {
  return resolveOutletOpenState({ now });
}

/** Convenience predicate over {@link getKitchenHours}. */
export function isKitchenOpen(now: Date = new Date()): boolean {
  return getKitchenHours(now).isOpen;
}
