/**
 * Pure decision logic for the payment FailurePanel (see src/routes/payment.tsx).
 * Extracted so the money-safety branches are unit-testable: a wrong
 * `retryable` branch either invites a double charge (Retry on paid money) or
 * strands a payer (no support path). The component renders what this returns.
 */
export interface FailurePanelContent {
  title: string;
  /** Full body copy. `paymentId` is interpolated by the component, not here. */
  body: string;
  showRetry: boolean;
  showContactSupport: boolean;
}

/** Server refusal: the outlet is not linked to a partner branch yet. */
export const STORE_NOT_LINKED = "STORE_NOT_LINKED";

/**
 * Order/payment failures that a Retry can never fix: a reconciliation block
 * (money may already have moved) and a store that is not taking online orders
 * at all. Everything else keeps its previous retry affordance.
 */
export function isNonRetryableOrderFailure(code?: string): boolean {
  return code === "PAYMENT_RECONCILIATION_PENDING" || code === STORE_NOT_LINKED;
}

export function describePaymentFailure(input: {
  status: string;
  message: string;
  retryable: boolean;
  code?: string;
}): FailurePanelContent {
  const { status, message, retryable, code } = input;
  if (status === "cancelled") {
    return {
      title: "Payment cancelled",
      body: `${message} You can try again. If your bank shows a charge, contact support.`,
      showRetry: true,
      showContactSupport: false,
    };
  }
  if (code === STORE_NOT_LINKED) {
    // Nothing was created at the gateway and nothing was charged, so this is
    // NOT the paid-but-pending branch below. Show the server's sentence and
    // offer support/checkout, never Retry.
    return {
      title: "Online ordering unavailable",
      body: message,
      showRetry: false,
      showContactSupport: true,
    };
  }
  if (!retryable) {
    // Paid-but-no-order: money moved. Never "no money has been charged",
    // never Retry (double-charge), no refund promise (we can't promise what
    // we haven't verified). Support CTA carries the payment id.
    return {
      title: "Payment received — order pending",
      body: `${message} Do not pay again. Contact support with the payment reference shown here and we will look into it.`,
      showRetry: false,
      showContactSupport: true,
    };
  }
  return {
    title: "Payment failed",
    body: `${message} You can try again. If your bank shows a charge, contact support.`,
    showRetry: true,
    showContactSupport: false,
  };
}
