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

export function describePaymentFailure(input: {
  status: string;
  message: string;
  retryable: boolean;
}): FailurePanelContent {
  const { status, message, retryable } = input;
  if (status === "cancelled") {
    return {
      title: "Payment cancelled",
      body: `${message} You can try again safely — no money has been charged.`,
      showRetry: true,
      showContactSupport: false,
    };
  }
  if (!retryable) {
    // Paid-but-no-order: money moved. Never "no money has been charged",
    // never Retry (double-charge). Support CTA carries the payment id.
    return {
      title: "Payment received — order pending",
      body: `${message} Do not pay again. Your payment ID is recorded — contact support and we will confirm your order or refund you.`,
      showRetry: false,
      showContactSupport: true,
    };
  }
  return {
    title: "Payment failed",
    body: `${message} You can try again safely — no money has been charged.`,
    showRetry: true,
    showContactSupport: false,
  };
}
