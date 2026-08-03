import { createHmac } from 'node:crypto';
import { RazorpaySignatureVerifier } from './razorpay-signature.verifier';
import { RazorpayCredentialsService } from './razorpay-credentials.service';

describe('RazorpaySignatureVerifier', () => {
  const secret = 'test_secret_dfjklsdjfkljsdfklj_1234567890';
  const webhookSecret = 'whsecret_abcdefghijklmnop_0000';
  const creds = {
    keySecret: () => secret,
    webhookSecret: () => webhookSecret,
  } as unknown as RazorpayCredentialsService;

  const verifier = new RazorpaySignatureVerifier(creds);

  it('accepts a valid checkout signature', () => {
    const orderId = 'order_ABC';
    const paymentId = 'pay_XYZ';
    const signature = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
    expect(() =>
      verifier.verifyCheckoutSignature({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      }),
    ).not.toThrow();
  });

  it('rejects a tampered checkout signature', () => {
    expect(() =>
      verifier.verifyCheckoutSignature({
        razorpayOrderId: 'order_ABC',
        razorpayPaymentId: 'pay_XYZ',
        razorpaySignature: 'deadbeef'.repeat(8),
      }),
    ).toThrow(/Invalid Razorpay checkout signature/);
  });

  it('accepts a valid webhook signature', () => {
    const body = '{"event":"payment.captured"}';
    const sig = createHmac('sha256', webhookSecret).update(body).digest('hex');
    expect(() => verifier.verifyWebhookSignature(body, sig)).not.toThrow();
  });

  it('rejects a tampered webhook signature', () => {
    const body = '{"event":"payment.captured"}';
    expect(() => verifier.verifyWebhookSignature(body, 'a'.repeat(64))).toThrow(
      /Invalid Razorpay webhook signature/,
    );
  });
});
