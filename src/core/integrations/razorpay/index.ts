/**
 * Razorpay integration adapter (contract only).
 *
 * The SDK bootstrap, order creation, and signature verification are
 * wired in the payments prompt. This file declares the interface every
 * checkout flow will consume.
 */
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
  createOrder(input: { amount: number; receipt: string }): Promise<RazorpayOrderIntent>;
  openCheckout(intent: RazorpayOrderIntent): Promise<RazorpayPaymentResult>;
  verifySignature(result: RazorpayPaymentResult): Promise<{ valid: boolean }>;
}

export const razorpayAdapter: RazorpayAdapter = {
  name: "razorpay",
  async createOrder() {
    throw new Error("Razorpay adapter not implemented.");
  },
  async openCheckout() {
    throw new Error("Razorpay adapter not implemented.");
  },
  async verifySignature() {
    throw new Error("Razorpay adapter not implemented.");
  },
};
