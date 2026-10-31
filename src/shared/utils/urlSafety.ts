/**
 * URL safety (Loop 18/120 — mirrors partner utils/urlSafety.ts).
 *
 * Customer-facing tracking links originate from order docs, and staff can
 * store arbitrary riderTrackingUrl values via manual rider assignment. An
 * unguarded href turns any compromised/mistyped entry into a phishing link
 * behind a trusted tracking label. Only the courier hosts our adapters
 * actually return may render as links, and only over https.
 *
 * - Borzo: `functions/src/modules/dispatch/providers/borzo.adapter.ts` reads
 *   the destination point's `tracking_url` (fallback
 *   `https://borzo.in/track/<orderId>`); vendor links live on borzo.in /
 *   borzodelivery.com.
 * - Shadowfax: `shadowfax.adapter.ts` reads `track_url`/`track`/`tracking_url`
 *   (fallback `https://shadowfax.in/track/<orderId>`).
 * - Porter: legacy bookings already in Firestore.
 */
const TRACKING_HOSTS = ["porter.in", "borzo.in", "borzodelivery.com", "shadowfax.in"];

export function isSafeTrackingUrl(url: string): boolean {
  const v = (url || "").trim();
  if (!/^https:\/\/[^\s"'<>]+$/.test(v)) return false;
  try {
    const host = new URL(v).hostname.toLowerCase();
    return TRACKING_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

/**
 * tel: links: digits/spaces/dashes only, sane length (mirrors partner
 * utils/urlSafety). A staff-stored "phone" like `12345` or a premium-rate
 * string must never become a one-tap dial link for customers.
 */
export function isSafeTelNumber(phone: string): boolean {
  return /^[+0-9][0-9\s-]{6,15}$/.test((phone || "").trim());
}

/**
 * mailto: links: basic shape + never fixture domains. A support fixture
 * like support@burgonomics.example must not become a tappable mailto that
 * just bounces.
 */
export function isSafeEmail(email: string): boolean {
  const v = (email || "").trim().toLowerCase();
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v)) return false;
  const host = v.split("@")[1];
  return !host.endsWith(".example") && host !== "example.com";
}
