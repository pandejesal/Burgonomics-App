import { describe, it, expect } from "vitest";
import {
  computeHmac,
  verifyRazorpaySignature,
  verifyPaymentSignature,
} from "../../netlify/functions/lib/verifySignature";

describe("Payments Hardening — HMAC Verification & Timing Safety", () => {
  const secret = "test_webhook_secret_xyz123";
  const rawBody = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_test_001",
          amount: 34900,
          currency: "INR",
        },
      },
    },
  });

  it("1. [HMAC-COMPUTE] computes valid sha256 hex digest", () => {
    const signature = computeHmac(rawBody, secret);
    expect(signature).toBeDefined();
    expect(typeof signature).toBe("string");
    expect(signature.length).toBe(64); // SHA-256 hex is 64 chars
  });

  it("2. [HMAC-VALID] verifies matching signature correctly", () => {
    const signature = computeHmac(rawBody, secret);
    const isValid = verifyRazorpaySignature(rawBody, signature, secret);
    expect(isValid).toBe(true);
  });

  it("3. [HMAC-TAMPER-REJECT] rejects tampered payload or signature", () => {
    const signature = computeHmac(rawBody, secret);
    const tamperedBody = rawBody.replace("34900", "99900");
    const isValid = verifyRazorpaySignature(tamperedBody, signature, secret);
    expect(isValid).toBe(false);
  });

  it("4. [HMAC-INVALID-SIG-REJECT] rejects corrupted signature", () => {
    const signature = computeHmac(rawBody, secret);
    const corruptedSig = signature.slice(0, -4) + "0000";
    const isValid = verifyRazorpaySignature(rawBody, corruptedSig, secret);
    expect(isValid).toBe(false);
  });

  it("5. [HMAC-MISSING-FIELDS] safely handles empty/undefined inputs without throwing", () => {
    expect(verifyRazorpaySignature("", "some_sig", secret)).toBe(false);
    expect(verifyRazorpaySignature(rawBody, undefined, secret)).toBe(false);
    expect(verifyRazorpaySignature(rawBody, null, secret)).toBe(false);
    expect(verifyRazorpaySignature(rawBody, "", secret)).toBe(false);
    expect(verifyRazorpaySignature(rawBody, "some_sig", "")).toBe(false);
  });

  it("6. [PAYMENT-SIG-VALID] verifies client payment signature (orderId|paymentId)", () => {
    const keySecret = "rzp_secret_key_abc";
    const orderId = "order_rzp_12345";
    const paymentId = "pay_rzp_67890";
    const payload = `${orderId}|${paymentId}`;
    const signature = computeHmac(payload, keySecret);

    expect(verifyPaymentSignature(orderId, paymentId, signature, keySecret)).toBe(true);
    expect(verifyPaymentSignature(orderId, paymentId, "invalid_sig", keySecret)).toBe(false);
    expect(verifyPaymentSignature(orderId, "wrong_payment_id", signature, keySecret)).toBe(false);
  });
});
