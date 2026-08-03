import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { IntegrationError } from '@common/errors';
import { ERROR_CODES } from '@common/errors/error-codes';
import { RazorpayCredentialsService } from './razorpay-credentials.service';

/**
 * Verifies Razorpay signatures.
 *
 * • Checkout signature: HMAC_SHA256(secret, `${order_id}|${payment_id}`)
 * • Webhook signature: HMAC_SHA256(webhook_secret, raw_body)
 *
 * Both use constant-time comparison.
 */
@Injectable()
export class RazorpaySignatureVerifier {
  constructor(private readonly credentials: RazorpayCredentialsService) {}

  verifyCheckoutSignature(input: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): void {
    const secret = this.credentials.keySecret();
    const expected = createHmac('sha256', secret)
      .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
      .digest('hex');
    if (!this.timingSafeHexEqual(expected, input.razorpaySignature)) {
      throw new IntegrationError(
        ERROR_CODES.RAZORPAY_SIGNATURE_INVALID,
        'Invalid Razorpay checkout signature',
      );
    }
  }

  verifyWebhookSignature(rawBody: string | Buffer, providedSignature: string): void {
    const secret = this.credentials.webhookSecret();
    if (!secret) {
      throw new IntegrationError(
        ERROR_CODES.RAZORPAY_SIGNATURE_INVALID,
        'RAZORPAY_WEBHOOK_SECRET is not configured',
      );
    }
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    if (!this.timingSafeHexEqual(expected, providedSignature)) {
      throw new IntegrationError(
        ERROR_CODES.RAZORPAY_SIGNATURE_INVALID,
        'Invalid Razorpay webhook signature',
      );
    }
  }

  private timingSafeHexEqual(expected: string, provided: string): boolean {
    if (!/^[0-9a-fA-F]+$/.test(provided) || provided.length !== expected.length) {
      return false;
    }
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
  }
}
