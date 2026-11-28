/**
 * Who may start a payment from the /payment screen, and how the bottom button
 * should speak.
 *
 * Extracted because the previous inline rule (`failure && !failure.retryable`)
 * was correct only for failures where money might have moved. A refusal that is
 * provably pre-write got the same treatment, so the panel said "nothing has been
 * charged — pay online" while the button underneath said "Payment under review
 * — do not pay again" and refused to let the customer pay. Two contradictory
 * sentences on one screen, and the disabling one won.
 *
 * Three codes reach here without any money having moved:
 *   - STORE_NOT_LINKED  : no branch linked, so no order and no charge.
 *   - STORE_CLOSED      : the shop is shut, so no order and no charge.
 *   - COURIER_COD_DISABLED : delivery cash refused before the first write.
 * The first two still cannot complete right now, so they stay blocked — but
 * they must not borrow the reconciliation wording. The third is blocked only
 * by the wrong tender: paying online is the fix, so its CTA must stay live.
 */
import { COURIER_COD_DISABLED, STORE_CLOSED, STORE_NOT_LINKED } from "./paymentFailure";

export interface PayCtaPolicyInput {
  status: string;
  failureCode?: string | null;
  /** `failure.retryable`; undefined when there is no failure. */
  retryable?: boolean;
  reconciliationPending: boolean;
}

export interface PayCtaPolicy {
  /** True when no new payment may start from here. */
  payBlocked: boolean;
  /** The remedy is to switch to online payment, so the CTA stays usable. */
  onlineRequired: boolean;
  storeNotLinked: boolean;
  outletClosed: boolean;
}

export function payCtaPolicy(input: PayCtaPolicyInput): PayCtaPolicy {
  const settled = input.status === "success";
  const code = input.failureCode ?? undefined;
  const onlineRequired = !settled && code === COURIER_COD_DISABLED;

  return {
    // Reconciliation always wins: there a payment genuinely may have gone
    // through, so nothing new may start, whatever the code.
    payBlocked:
      input.reconciliationPending || (!settled && input.retryable === false && !onlineRequired),
    onlineRequired,
    storeNotLinked: !settled && code === STORE_NOT_LINKED,
    outletClosed: !settled && code === STORE_CLOSED,
  };
}
