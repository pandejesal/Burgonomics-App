/** Haversine distance in kilometres between two lat/lng pairs. */
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
  if (km === undefined || Number.isNaN(km)) return "—";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/**
 * Detects if the store closes within `warnMinutes` from now, in the
 * store's local wall clock (mock: uses the device clock — a real
 * implementation would use the store's timezone).
 */
export function closesSoon(closeHHmm: string, warnMinutes = 60): boolean {
  const [h, m] = closeHHmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;
  const now = new Date();
  const close = new Date(now);
  close.setHours(h, m, 0, 0);
  if (close.getTime() < now.getTime() - 12 * 3600 * 1000) {
    close.setDate(close.getDate() + 1);
  }
  const diffMin = (close.getTime() - now.getTime()) / 60000;
  return diffMin > 0 && diffMin <= warnMinutes;
}
