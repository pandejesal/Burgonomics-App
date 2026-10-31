import { getPlatform } from "@/shared/platform/platform";

/**
 * Checks if the current environment is development.
 */
const IS_DEV = import.meta.env?.DEV || process.env.NODE_ENV !== "production";

/**
 * Generates the permanent Google Maps search URL for a store location.
 * Format: https://www.google.com/maps/search/?api=1&query=<lat>,<lng>
 */
export function getPermanentMapUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/**
 * A coordinate pair is only usable when BOTH values are finite numbers —
 * a missing / NaN / Infinity origin must never reach the URL.
 */
function hasValidOrigin(originLat?: number, originLng?: number): boolean {
  return (
    typeof originLat === "number" &&
    typeof originLng === "number" &&
    Number.isFinite(originLat) &&
    Number.isFinite(originLng)
  );
}

/**
 * Generates the Google Maps directions URL for a route.
 *
 * Format (origin present):
 *   https://www.google.com/maps/dir/?api=1&origin=<oLat>,<oLng>&destination=<dLat>,<dLng>
 * Format (origin omitted or not a valid finite pair):
 *   https://www.google.com/maps/dir/?api=1&destination=<dLat>,<dLng>
 */
export function getDirectionsUrl(
  destLat: number,
  destLng: number,
  originLat?: number,
  originLng?: number,
): string {
  const origin = hasValidOrigin(originLat, originLng) ? `&origin=${originLat},${originLng}` : "";
  return `https://www.google.com/maps/dir/?api=1${origin}&destination=${destLat},${destLng}`;
}

/**
 * Handles the "Directions" flow for a store based on platform and availability.
 *
 * Optional `originLat`/`originLng` (the user's delivery address or GPS fix)
 * are appended as the route start when both are finite numbers.
 *
 * • Android:
 *   - If Capacitor native, first attempt:
 *     google.navigation:q=<lat>,<lng>
 *   - If unavailable, automatically fall back to:
 *     https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>
 *
 * • iOS:
 *     https://maps.apple.com/?daddr=<lat>,<lng>, opened in the system browser
 *     (Capacitor routes window.open(..., "_blank") to SFSafariViewController,
 *     which is not subject to limitsNavigationsToAppBoundDomains)
 *     With a valid origin, Apple Maps gets the equivalent &saddr=<lat>,<lng>.
 *
 * • Browser (including mobile browser or non-native platforms):
 *     https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>
 */
export function openDirections(
  storeName: string,
  lat: number,
  lng: number,
  originLat?: number,
  originLng?: number,
): void {
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIosDevice = getPlatform() === "ios" || /Mac|iPad|iPhone|iPod/i.test(userAgent);

  const finalUrl = isIosDevice
    ? `https://maps.apple.com/?daddr=${lat},${lng}${
        hasValidOrigin(originLat, originLng) ? `&saddr=${originLat},${originLng}` : ""
      }`
    : getDirectionsUrl(lat, lng, originLat, originLng);

  try {
    window.open(finalUrl, "_blank", "noopener,noreferrer");
  } catch (e) {
    console.warn("Failed to open directions map:", e);
  }
}
