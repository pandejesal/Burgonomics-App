/**
 * Razorpay integration adapter.
 *
 * Implements the core Razorpay adapter contract and delegates to the production
 * payments module for order creation, modal checkout, and server-side HMAC verification.
 */
import { paymentsService } from "@/features/payments/services/paymentsService";
import { razorpayAdapter as featureAdapter } from "@/features/payments/adapters/razorpayAdapter";
import { appConfig } from "@/core/config/env";
import type { PaymentResult } from "@/features/payments/models";

export interface RazorpayOrderIntent {
  orderId: string;
  amount: number;
  currency: "INR";
  receipt: string;
}

export interface RazorpayPaymentResult {
  paymentId: string;
  orderId: string;
  signature: string;
}

export interface RazorpayAdapter {
  readonly name: "razorpay";
  createOrder(input: {
    amount: number;
    receipt: string;
    storeId?: string;
    fulfillment?: string;
  }): Promise<RazorpayOrderIntent>;
  openCheckout(
    intentOrHandlers: RazorpayOrderIntent | Parameters<typeof featureAdapter.openCheckout>[0],
    method?: Parameters<typeof featureAdapter.openCheckout>[1],
  ): Promise<RazorpayPaymentResult | void>;
  verifySignature(result: RazorpayPaymentResult): Promise<{ valid: boolean }>;
}

export const razorpayAdapter: RazorpayAdapter = {
  name: "razorpay",
  async createOrder(input) {
    const res = await paymentsService.createOrder({
      amount: input.amount,
      currency: "INR",
      receipt: input.receipt,
      storeId: input.storeId || "str_ahmedabad_01",
      // PAYMENTS_CONTRACT_SPEC §1: `orderType` is canonical; `fulfillment`
      // stays as the legacy alias. This legacy wrapper has no internal
      // order id to bind (the canonical path is PaymentRepository, which
      // creates the payment-pending order first) — orderId is therefore
      // absent here and the server's order-binding check applies to the
      // repository path only.
      orderType: toOrderType(input.fulfillment),
      fulfillment: input.fulfillment || "delivery",
    });

    if (!res.success) {
      throw new Error(res.error.message || "Failed to create payment order");
    }

    return {
      orderId: res.data.orderId,
      amount: res.data.amount,
      currency: "INR",
      receipt: res.data.receipt,
    };
  },

  async openCheckout(intentOrHandlers, method) {
    if ("orderId" in intentOrHandlers && "amount" in intentOrHandlers) {
      const intent = intentOrHandlers as RazorpayOrderIntent;
      return new Promise<RazorpayPaymentResult>((resolve, reject) => {
        // Loop: never hand the checkout a bogus key. The configured publishable
        // key (if any) goes live-test; otherwise the adapter's simulation
        // sentinel keeps us in the honest simulation branch. The old
        // "rzp_test_mock" literal passed isLive() and fired a REAL checkout
        // attempt with an invalid key.
        const configuredKey = appConfig.integrations.razorpayKeyId || "";
        featureAdapter
          .initialize({
            order: {
              orderId: intent.orderId,
              keyId: configuredKey || "rzp_test_placeholder",
              amount: intent.amount,
              currency: intent.currency,
              receipt: intent.receipt,
            },
          })
          .then(() => {
            return featureAdapter.openCheckout(
              {
                onSuccess: (res: PaymentResult) => {
                  resolve({
                    paymentId: res.paymentId,
                    orderId: res.orderId,
                    signature: res.signature,
                  });
                },
                onFailure: (err) => reject(new Error(err.description || err.code)),
                onCancel: () => reject(new Error("Payment cancelled by user")),
              },
              method,
            );
          })
          .catch(reject);
      });
    }

    return featureAdapter.openCheckout(intentOrHandlers as any, method);
  },

  async verifySignature(result) {
    // PAYMENTS_CONTRACT_SPEC §2: `paymentsService.verify` translates this
    // result into the canonical `{ orderId, razorpayOrderId,
    // razorpayPaymentId, razorpaySignature }` request. This legacy wrapper
    // has no internal order id, so `orderId` falls back to the gateway id.
    const res = await paymentsService.verify({
      orderId: result.orderId,
      paymentId: result.paymentId,
      signature: result.signature,
      method: "online",
    });
    return { valid: res.success };
  },
};

/** PAYMENTS_CONTRACT_SPEC §1 enum — the app's fulfilment names map 1:1. */
function toOrderType(fulfillment?: string): "delivery" | "takeaway" | "dinein" {
  if (fulfillment === "takeaway" || fulfillment === "pickup") return "takeaway";
  if (fulfillment === "dinein" || fulfillment === "dine-in") return "dinein";
  return "delivery";
}
