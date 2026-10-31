/**
 * The cart total is a CLIENT estimate; the gateway opens on the SERVER's
 * validated total. When the two differ, the customer must be shown the
 * authoritative figure and accept it before any money screen opens — otherwise
 * the sheet silently charges a different number than the one they reviewed.
 *
 * Pure and dependency-free so it can be pinned without rendering the page (the
 * route module needs a DOM, this does not).
 */
export function needsRepriceAcceptance(
  displayed: number | undefined,
  authoritative: number | undefined,
  accepted: number | null,
): boolean {
  return (
    typeof displayed === "number" &&
    typeof authoritative === "number" &&
    Math.abs(authoritative - displayed) >= 0.01 &&
    accepted !== authoritative
  );
}
