/**
 * Post-gateway payment recovery — the single decision + copy layer shared by
 * `src/routes/payment.tsx`, `src/routes/checkout.tsx` and
 * `src/features/payment/hooks/useRazorpayPayment.ts` (A08 B1/B9, lane C01).
 *
 * Money-safety rules encoded here (pure: no stores, no network, no side
 * effects, so every branch is unit-testable):
 *
 * - Only a code the SERVER proved non-captured via a live gateway fetch may
 *   drive `markPaymentFailed` (kind "uncaptured"). Signature failures
 *   (`INVALID_SIGNATURE` / `VERIFICATION_FAILED` / `SIGNATURE_MISMATCH`) prove
 *   an HMAC mismatch and nothing about capture state (A08 B1), so they fall
 *   through to reconciliation.
 * - `PAYMENT_NOT_CAPTURED` (`awaiting_capture`) proves non-capture, but a held
 *   authorization can still capture later — no new payment is offered
 *   automatically; it reconciles too (A08 P4).
 * - Every other post-gateway outcome — HTTP 503, unknown server codes, an
 *   unverified 200, an exhausted 202 retry, a thrown finalize — returns kind
 *   "reconciliation". The caller must persist the uid-scoped reconciliation
 *   record, set `reconciliationPending`, show the recovery panel (payment id +
 *   do-not-pay-again + support), and must NEVER mark the order failed, clear
 *   the cart, navigate to confirmation, or offer a new payment.
 */
import type { ApiResult } from "@/core/network/http";
import type { PaymentVerification } from "@/features/payments/models";
import { isUncapturedPaymentError } from "@/features/payments/services/paymentsService";

/** Reconciliation reasons that have recovery-panel copy (and vice versa). */
export type RecoveryReason =
  | "PAYMENT_SYNC_PENDING"
  | "TRANSFER_IN_PROGRESS"
  | "ORDER_TERMINAL"
  | "PAYMENT_NOT_CAPTURED";

export type VerifyOutcome =
  | { kind: "verified"; verification: PaymentVerification }
  | {
      kind: "uncaptured";
      /** Server code that proved non-capture. */
      code: string;
      message: string;
      /** True only when a fresh attempt cannot double-charge. */
      retryable: boolean;
      internalOrderId: string;
      paymentId?: string;
    }
  | {
      kind: "reconciliation";
      reason: RecoveryReason;
      /** Server code behind the reason (support/telemetry reference). */
      serverCode: string;
      message: string;
      paymentId?: string;
      internalOrderId: string | null;
      gatewayOrderId: string | null;
    };

/**
 * Uncaptured codes where a fresh attempt is NOT safe: the payment does not
 * belong to this order / was already settled, so re-running checkout would
 * charge again for something that already happened. (Signature codes used to
 * sit here; they no longer reach this branch at all.)
 */
const NON_RETRYABLE_UNCAPTURED = new Set<string>();

export function isRecoveryReason(code: unknown): code is RecoveryReason {
  return (
    code === "PAYMENT_SYNC_PENDING" ||
    code === "TRANSFER_IN_PROGRESS" ||
    code === "ORDER_TERMINAL" ||
    code === "PAYMENT_NOT_CAPTURED"
  );
}

/**
 * Decide what a verify result means for money safety. `paymentId` is the
 * gateway id from the checkout callback — the only id that is safe to render
 * (signatures are never stored, logged or echoed here).
 */
export function resolveVerifyOutcome(input: {
  verify: ApiResult<PaymentVerification>;
  internalOrderId?: string | null;
  gatewayOrderId?: string | null;
  paymentId?: string;
}): VerifyOutcome {
  const { verify } = input;
  const internalOrderId = input.internalOrderId ?? null;
  const gatewayOrderId = input.gatewayOrderId ?? null;
  const paymentId =
    input.paymentId ?? (verify.success ? verify.data.paymentId : undefined) ?? undefined;

  if (verify.success && verify.data.verified) {
    return { kind: "verified", verification: verify.data };
  }

  // A 200 envelope without a verified payload is NOT a success and NOT a
  // failure we can prove — it is an unknown post-gateway outcome.
  const serverCode = verify.success ? "VERIFICATION_FAILED" : verify.error.code;
  const message = verify.success ? "Payment verification failed." : verify.error.message;

  // A reconciliation outcome is always fail-closed for the UI: callers set
  // `failure.retryable = false`, so no new payment can be offered from it.
  const reconcile = (reason: RecoveryReason): VerifyOutcome => ({
    kind: "reconciliation",
    reason,
    serverCode,
    message,
    paymentId,
    internalOrderId,
    gatewayOrderId,
  });

  // Verified money, split still running (HTTP 202, bounded same-request
  // retry already exhausted inside paymentsService).
  if (serverCode === "TRANSFER_IN_PROGRESS") return reconcile("TRANSFER_IN_PROGRESS");
  // Money already settled for an existing order: recovery is "open the order",
  // never "pay again".
  if (serverCode === "ORDER_TERMINAL") return reconcile("ORDER_TERMINAL");
  // Proven non-capture, but an authorization may be held — no automatic re-pay.
  if (serverCode === "PAYMENT_NOT_CAPTURED") return reconcile("PAYMENT_NOT_CAPTURED");

  if (internalOrderId && isUncapturedPaymentError(serverCode)) {
    return {
      kind: "uncaptured",
      code: serverCode,
      message,
      retryable: !NON_RETRYABLE_UNCAPTURED.has(serverCode),
      internalOrderId,
      paymentId,
    };
  }

  // Everything else (503, unknown codes, bad signature, unverified 200):
  // unknown capture state → persist reconciliation, never fail the order.
  return reconcile("PAYMENT_SYNC_PENDING");
}

interface RecoveryCopy {
  title: string;
  body: string;
}

/**
 * Honest copy per recovery reason. No raw server/gateway text (P1-8), no
 * "no money has been charged" claim, and every string carries the
 * do-not-pay-again instruction the old spinner was missing (A08 B9).
 */
const RECOVERY_COPY: Record<RecoveryReason, RecoveryCopy> = {
  PAYMENT_SYNC_PENDING: {
    title: "Payment not confirmed yet",
    body: "We could not confirm this payment yet. Do not pay again. Check My Orders or contact support with the payment reference below.",
  },
  TRANSFER_IN_PROGRESS: {
    title: "Payment processing",
    body: "Your payment is still being processed. Do not pay again. Check My Orders for confirmation or contact support if it remains pending.",
  },
  ORDER_TERMINAL: {
    title: "Order needs review",
    body: "This order can no longer be confirmed by this payment attempt. Do not pay again. Check My Orders for its current status or contact support.",
  },
  PAYMENT_NOT_CAPTURED: {
    title: "Payment not completed",
    body: "Your payment has not been captured, but your bank may show a pending authorization. Do not pay again until its status is resolved. Contact support with the payment reference below.",
  },
};

/** Copy used by the rendered recovery panel and by its toast/message text. */
export function describePaymentRecovery(reason: RecoveryReason): RecoveryCopy {
  return RECOVERY_COPY[reason];
}

/**
 * Maps the server-written order marker (`order.reconciliation`, A08 B5) onto the
 * closest EXISTING recovery reason.
 *
 * Why a mapping and not new copy: the marker's `reason` is ops vocabulary
 * (`confirm_amount_mismatch`, `capture_on_cancelled_order`) and must never be
 * shown to a customer as-is, and inventing a second set of customer strings for
 * the same situations would drift from these. An unknown or absent reason
 * degrades to the sync-pending copy ("do not pay again"), which is the honest
 * instruction whenever we cannot say more.
 */
export function recoveryReasonForOrderMarker(reason?: string | null): RecoveryReason {
  switch (reason) {
    case "capture_on_cancelled_order":
    case "capture_on_refunded_order":
      return "ORDER_TERMINAL";
    default:
      return "PAYMENT_SYNC_PENDING";
  }
}
