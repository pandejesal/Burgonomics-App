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
