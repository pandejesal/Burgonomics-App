/** Haversine distance in kilometres between two lat/lng pairs. */
import {
  istMinutesSinceMidnight,
  parseHourMinute,
} from "@/core/constants/operatingHours";

/** Minutes in a day; the wrap base for an overnight close time. */
const MINUTES_PER_DAY = 24 * 60;

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  if (
    !a ||
    !b ||
    typeof a.lat !== "number" ||
    typeof a.lng !== "number" ||
    typeof b.lat !== "number" ||
    typeof b.lng !== "number" ||
    Number.isNaN(a.lat) ||
    Number.isNaN(a.lng) ||
    Number.isNaN(b.lat) ||
    Number.isNaN(b.lng)
  ) {
    return Infinity;
  }
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Returns a human-friendly distance string ("1.2 km" / "800 m"). */
export function formatDistance(km?: number): string {
  if (km === undefined || !Number.isFinite(km)) return "—";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/**
 * Detects if the store closes within `warnMinutes` from now, on the **outlet's**
 * wall clock (Asia/Kolkata), not the device's.
 *
 * The stored value may be 24-hour (`"23:30"`) or 12-hour (`"11:30 PM"`); both
 * exist in the database, and the original split(":") implementation produced
 * `NaN` for every 12-hour value, silently reporting "not closing soon" forever
 * for 26 of the 27 documents that carry hours.
 *
 * `nowMinutes` is injectable so this can be tested without a timezone or a fake
 * clock. Left at its default it reads IST, which is the same clock
 * `resolveOutletOpenState` gates on; the previous version compared an IST close
 * time against the device clock, so a handset east of IST fired the badge ~90
 * minutes early and one west of it never fired at all.
 */
export function closesSoon(
  closeHHmm: string,
  warnMinutes = 60,
  nowMinutes: number = istMinutesSinceMidnight(),
): boolean {
  const closeMinutes = parseHourMinute(closeHHmm);
  if (closeMinutes === null) return false;
  const delta = (closeMinutes - nowMinutes + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return delta > 0 && delta <= warnMinutes;
}
