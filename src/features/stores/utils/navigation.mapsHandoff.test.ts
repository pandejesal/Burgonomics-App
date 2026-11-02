import { describe, expect, it } from "vitest";
import { getDirectionsUrl, getPermanentMapUrl } from "./navigation";

/**
 * Cross-layer guard for the Android Maps hand-off.
 *
 * `MainActivity.isGoogleMapsTarget` externalises a URL only when it is HTTPS,
 * the host is exactly google.com / www.google.com / maps.google.com, and the
 * path is `/maps` or `/maps/...`. These are the URLs this app actually builds;
 * if a builder ever changes shape, the native allowlist silently stops
 * matching and Maps links go back to loading inside the checkout popup.
 */
function assertMapsAllowlisted(url: string) {
  const parsed = new URL(url);
  expect(parsed.protocol).toBe("https:");
  expect(["google.com", "www.google.com", "maps.google.com"]).toContain(parsed.hostname);
  expect(parsed.pathname === "/maps" || parsed.pathname.startsWith("/maps/")).toBe(true);
}

describe("Maps URLs stay inside the Android hand-off allowlist", () => {
  it("directions URL (destination only) matches the native allowlist", () => {
    assertMapsAllowlisted(getDirectionsUrl(23.0131, 72.5085));
  });

  it("directions URL (with origin) matches the native allowlist", () => {
    assertMapsAllowlisted(getDirectionsUrl(23.0131, 72.5085, 19.076, 72.8777));
  });

  it("permanent search URL matches the native allowlist", () => {
    assertMapsAllowlisted(getPermanentMapUrl(23.0131, 72.5085));
  });

  it("builders never emit a lookalike host the native side would reject", () => {
    for (const url of [
      getDirectionsUrl(23.0131, 72.5085),
      getDirectionsUrl(23.0131, 72.5085, 19.076, 72.8777),
      getPermanentMapUrl(23.0131, 72.5085),
    ]) {
      expect(url).not.toMatch(/evil|\.tld|google\.com\./i);
      expect(new URL(url).hostname.endsWith("google.com")).toBe(true);
    }
  });
});
