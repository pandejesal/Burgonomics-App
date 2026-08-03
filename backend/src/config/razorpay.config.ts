import { registerAs } from '@nestjs/config';

export interface RazorpayConfig {
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
  baseUrl: string;
  httpTimeoutMs: number;
  replayWindowSeconds: number;
  orderExpiryMinutes: number;
}

export default registerAs<RazorpayConfig>('razorpay', () => ({
  keyId: process.env.RAZORPAY_KEY_ID,
  keySecret: process.env.RAZORPAY_KEY_SECRET,
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  baseUrl: process.env.RAZORPAY_BASE_URL ?? 'https://api.razorpay.com/v1',
  httpTimeoutMs: Number(process.env.RAZORPAY_HTTP_TIMEOUT_MS ?? 15000),
  replayWindowSeconds: Number(process.env.RAZORPAY_REPLAY_WINDOW_SECONDS ?? 300),
  orderExpiryMinutes: Number(process.env.RAZORPAY_ORDER_EXPIRY_MINUTES ?? 15),
}));
