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
 * F2 (staging 2026-11-21, Test 9): staff closed the outlet, so NO new online
 * customer order can be taken — checkout fees, online payment and cash order
 * all answer this 409. It is a static refusal (the shop has to reopen), so a
 * Retry button would only invite a second failed attempt.
 */
export const STORE_CLOSED = "STORE_CLOSED";

/**
 * F1 (staging 2026-11-21, Test 8): the coupon would take ₹0 off the bill, so
 * the server refuses it instead of saying "Coupon applied.". The app shows the
 * server's sentence and does not attach the coupon.
 */
export const COUPON_NO_DISCOUNT = "COUPON_NO_DISCOUNT";

/**
 * Launch policy (owner, 26 Nov 2026): a delivery order with money due must be
 * paid online. The server refuses delivery cash with HTTP 409
 * `COURIER_COD_DISABLED`, thrown inside the create transaction BEFORE any
 * write. Nothing has been charged and no order exists.
 *
 * This must never fall into the `!retryable` branch below, whose copy assumes
 * money may have moved ("Payment received — order pending" / "Do not pay
 * again"). That would be false, and it would advise the customer against the
 * one action that fixes the order: paying online.
 */
export const COURIER_COD_DISABLED = "COURIER_COD_DISABLED";

/** True when the refusal is "this outlet is closed right now". */
export function isStoreClosedRefusal(code?: string): boolean {
  return code === STORE_CLOSED;
}

/**
 * Order/payment failures that a Retry can never fix: a reconciliation block
 * (money may already have moved), a store that is not taking online orders at
 * all, and an outlet that is currently closed. Everything else keeps its
 * previous retry affordance.
 */
export function isNonRetryableOrderFailure(code?: string): boolean {
  return (
    code === "PAYMENT_RECONCILIATION_PENDING" ||
    code === STORE_NOT_LINKED ||
    code === STORE_CLOSED ||
    code === COURIER_COD_DISABLED
  );
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
  if (code === STORE_CLOSED) {
    // F2: the shop is closed. Nothing was created and nothing was charged; the
    // fix is "order during opening hours", which a Retry cannot provide.
    return {
      title: "Outlet is closed",
      body: message,
      showRetry: false,
      showContactSupport: true,
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
  if (code === COURIER_COD_DISABLED) {
    // Refused before any write, so this is NOT the paid-but-pending branch.
    // Say plainly that nothing was charged and name the action that works.
    return {
      title: "Pay online for delivery",
      body: `${message} Nothing has been charged. Pay online to receive this delivery, or choose takeaway or dine-in if you want to pay cash.`,
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
