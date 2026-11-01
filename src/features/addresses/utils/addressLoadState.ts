/**
 * CUS-18 — the three honest states of a saved-address read.
 *
 * Checkout used to render only the persisted LOCAL address list, so a fresh
 * profile (or a second device) showed "No saved delivery addresses found" for
 * an account that does have addresses server-side. A read that is still in
 * flight, or one that failed, is not an empty list either — telling a customer
 * they have no saved addresses when we simply could not look is the same lie
 * the orders history used to tell.
 */
export type AddressLoadState = "loading" | "error" | "empty" | "ready";

export const ADDRESS_LOADING_COPY = "Loading your saved addresses…";
export const ADDRESS_LOAD_FAILED_COPY =
  "We couldn't load your saved addresses. Check your connection and try again.";

export function classifyAddressLoad(input: {
  loading: boolean;
  error: string | null;
  count: number;
}): AddressLoadState {
  // Order matters: a first read in flight beats "empty", and an error beats
  // an empty result even if a stale local row exists.
  if (input.loading) return "loading";
  if (input.error) return "error";
  if (input.count > 0) return "ready";
  return "empty";
}
