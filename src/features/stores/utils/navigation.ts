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
 * Handles the "Directions" flow for a store based on platform and availability.
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
 *
 * • Browser (including mobile browser or non-native platforms):
 *     https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>
 */
export function openDirections(storeName: string, lat: number, lng: number): void {
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIosDevice = getPlatform() === "ios" || /Mac|iPad|iPhone|iPod/i.test(userAgent);

  const finalUrl = isIosDevice
    ? `https://maps.apple.com/?daddr=${lat},${lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  try {
    window.open(finalUrl, "_blank", "noopener,noreferrer");
  } catch (e) {
    console.warn("Failed to open directions map:", e);
  }
}
