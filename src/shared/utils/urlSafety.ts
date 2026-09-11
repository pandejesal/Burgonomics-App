/**
 * URL safety (Loop 18/120 — mirrors partner utils/urlSafety.ts).
 *
 * Customer-facing tracking links originate from order docs, and staff can
 * store arbitrary riderTrackingUrl values via manual rider assignment. An
 * unguarded href turns any compromised/mistyped entry into a phishing link
 * behind a trusted "Porter Live Radar" label. Only porter.in tracking URLs
 * ever render as links.
 */
export function isSafeTrackingUrl(url: string): boolean {
  const v = (url || "").trim();
  if (!/^https:\/\/[^\s"'<>]+$/.test(v)) return false;
  try {
    const host = new URL(v).hostname.toLowerCase();
    return host === "porter.in" || host.endsWith(".porter.in");
  } catch {
    return false;
  }
}
