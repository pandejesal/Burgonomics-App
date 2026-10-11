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
  /**
   * Razorpay gateway order id (`order_XXXX`). Kept as `orderId` for the
   * existing adapter/checkout contract; `razorpayOrderId` mirrors it under
   * the canonical PAYMENTS_CONTRACT_SPEC §1 name.
   */
  orderId: string;
  /** Canonical gateway order id (alias of `orderId`). */
  razorpayOrderId?: string;
  /** Razorpay key id (publishable, safe to ship to the client). */
  keyId: string;
  /** Gateway amount in rupees (server reprices authoritatively). */
  amount: Money;
  /** Gateway amount in paise — canonical per PAYMENTS_CONTRACT_SPEC §1. */
  amountPaise?: number;
  currency: "INR";
  receipt: string;
  /** Opaque metadata the backend attaches (checkoutToken, store, fulfillment). */
  meta?: Record<string, unknown>;
}

export interface PaymentResult {
  /** Razorpay gateway order id (`order_XXXX`). */
  orderId: string;
  paymentId: string;
  signature: string;
  method: PaymentMethod;
  /**
   * Internal Firestore order id created BEFORE the gateway opened
   * (PAYMENTS_CONTRACT_SPEC §3). Verification binds the gateway payment to
   * this order, not to the gateway id.
   */
  internalOrderId?: string;
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
      | "min_order"
      | "closed_store"
      | "cart_invalid";
    message: string;
  }>;
}
