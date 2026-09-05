/**
 * Payments domain models — the frontend contract.
 *
 * The real backend will fill these with Razorpay order metadata,
 * signed intents, and verification receipts. Screens and repositories
 * consume these types today via mock implementations so no UI change
 * is required when the live gateway is wired.
 */
import type { Money } from "@/core/models";

export type PaymentMethod = "online" | "cash" | "upi" | "card" | "netbanking" | "wallet";

export type PaymentStatus =
  "idle" | "preparing" | "waiting" | "success" | "failed" | "cancelled" | "retrying" | "error";

export interface PaymentOrder {
  /** Backend-issued order id. Will be `order_XXXX` from Razorpay in prod. */
  orderId: string;
  /** Razorpay key id (publishable, safe to ship to the client). */
  keyId: string;
  amount: Money;
  currency: "INR";
  receipt: string;
  /** Opaque metadata the backend attaches (checkoutToken, store, fulfillment). */
  meta?: Record<string, unknown>;
}

export interface PaymentResult {
  orderId: string;
  paymentId: string;
  signature: string;
  method: PaymentMethod;
}

export interface PaymentVerification {
  verified: boolean;
  /** Final backend order id, ready to be shown on the confirmation screen. */
  confirmedOrderId: string;
}

export interface PaymentFailure {
  code: string;
  message: string;
  retryable: boolean;
  method?: PaymentMethod;
  /** Razorpay payment id when money actually moved (paid-but-no-order). */
  paymentId?: string;
}

export interface PaymentPreflight {
  valid: boolean;
  issues: Array<{
    code:
      | "cart_empty"
      | "no_store"
      | "no_fulfillment"
      | "no_address"
      | "not_authenticated"
      | "cart_invalid";
    message: string;
  }>;
}
