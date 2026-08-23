import * as crypto from "crypto";

/**
 * Computes a SHA256 HMAC digest in hex format for a payload and secret.
 */
export function computeHmac(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Validates a Razorpay Webhook signature using constant-time comparison to prevent timing attacks.
 *
 * @param rawBody - Unparsed string or buffer representation of the request body.
 * @param headerSig - The `x-razorpay-signature` header value.
 * @param secret - The `RAZORPAY_WEBHOOK_SECRET`.
 * @returns boolean indicating whether the signature is authentic.
 */
export function verifyRazorpaySignature(
  rawBody: string | Buffer,
  headerSig: string | undefined | null,
  secret: string,
): boolean {
  if (!rawBody || !headerSig || !secret) {
    return false;
  }

  const payloadString = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const expectedHmac = crypto.createHmac("sha256", secret).update(payloadString).digest();

  let providedHmac: Buffer;
  try {
    providedHmac = Buffer.from(headerSig.trim(), "hex");
  } catch {
    return false;
  }

  if (providedHmac.length !== expectedHmac.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedHmac, providedHmac);
}

/**
 * Validates a client payment verification signature (orderId|paymentId) using constant-time comparison.
 *
 * @param orderId - Razorpay Order ID.
 * @param paymentId - Razorpay Payment ID.
 * @param signature - Client-provided razorpay_signature.
 * @param secret - RAZORPAY_KEY_SECRET.
 * @returns boolean indicating whether payment signature matches.
 */
export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string | undefined | null,
  secret: string,
): boolean {
  if (!orderId || !paymentId || !signature || !secret) {
    return false;
  }

  const text = `${orderId}|${paymentId}`;
  const expectedHmac = crypto.createHmac("sha256", secret).update(text).digest();

  let providedHmac: Buffer;
  try {
    providedHmac = Buffer.from(signature.trim(), "hex");
  } catch {
    return false;
  }

  if (providedHmac.length !== expectedHmac.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedHmac, providedHmac);
}
