/**
 * Canonical customer tracking URL for an order. Single source — both share
 * call sites used to interpolate this independently (a typo in either copy
 * silently shipped broken tracking links). Pure and DOM-free (takes origin
 * explicitly) so it stays unit-testable in the node suite.
 */
export function buildTrackUrl(id: string, origin?: string): string {
  const base = (
    origin ??
    (typeof window !== "undefined" ? window.location.origin : "")
  ).replace(/\/$/, "");
  return `${base}/orders/${id}/track`;
}
