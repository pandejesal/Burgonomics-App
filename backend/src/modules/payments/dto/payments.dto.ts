import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';
import {
  MAX_PAYMENT_AMOUNT,
  MIN_PAYMENT_AMOUNT,
  RAZORPAY_WEBHOOK_EVENTS,
  SUPPORTED_CURRENCIES,
} from '../constants';

// ═══════════════════════════════════════════════════════════════
// Outbound (backend → Razorpay) request DTOs — Zod validated
// ═══════════════════════════════════════════════════════════════

export const RazorpayCreateOrderRequestSchema = z.object({
  amount: z.number().int().positive(), // paise
  currency: z.enum(SUPPORTED_CURRENCIES),
  receipt: z.string().min(1).max(40),
  payment_capture: z.union([z.literal(0), z.literal(1)]).default(1),
  notes: z.record(z.string(), z.string()).optional(),
});
export type RazorpayCreateOrderRequest = z.infer<typeof RazorpayCreateOrderRequestSchema>;

export const RazorpayCreateRefundRequestSchema = z.object({
  amount: z.number().int().positive().optional(),
  speed: z.enum(['normal', 'optimum']).default('normal'),
  receipt: z.string().optional(),
  notes: z.record(z.string(), z.string()).optional(),
});
export type RazorpayCreateRefundRequest = z.infer<typeof RazorpayCreateRefundRequestSchema>;

// ═══════════════════════════════════════════════════════════════
// Inbound (Razorpay → backend) response DTOs
// ═══════════════════════════════════════════════════════════════

export const RazorpayOrderResponseSchema = z.object({
  id: z.string(),
  entity: z.literal('order'),
  amount: z.number(),
  amount_paid: z.number().default(0),
  amount_due: z.number().default(0),
  currency: z.string(),
  receipt: z.string().nullable().optional(),
  status: z.string(),
  attempts: z.number().default(0),
  notes: z.union([z.record(z.string(), z.string()), z.array(z.unknown())]).optional(),
  created_at: z.number(),
});
export type RazorpayOrderResponse = z.infer<typeof RazorpayOrderResponseSchema>;

export const RazorpayPaymentResponseSchema = z.object({
  id: z.string(),
  entity: z.literal('payment'),
  amount: z.number(),
  currency: z.string(),
  status: z.string(),
  order_id: z.string().nullable().optional(),
  method: z.string().nullable().optional(),
  captured: z.boolean().optional(),
  email: z.string().nullable().optional(),
  contact: z.string().nullable().optional(),
  fee: z.number().nullable().optional(),
  tax: z.number().nullable().optional(),
  error_code: z.string().nullable().optional(),
  error_description: z.string().nullable().optional(),
  notes: z.union([z.record(z.string(), z.string()), z.array(z.unknown())]).optional(),
  created_at: z.number(),
});
export type RazorpayPaymentResponse = z.infer<typeof RazorpayPaymentResponseSchema>;

export const RazorpayRefundResponseSchema = z.object({
  id: z.string(),
  entity: z.literal('refund'),
  amount: z.number(),
  currency: z.string(),
  payment_id: z.string(),
  status: z.string(),
  speed_requested: z.string().nullable().optional(),
  speed_processed: z.string().nullable().optional(),
  notes: z.union([z.record(z.string(), z.string()), z.array(z.unknown())]).optional(),
  created_at: z.number(),
});
export type RazorpayRefundResponse = z.infer<typeof RazorpayRefundResponseSchema>;

// ═══════════════════════════════════════════════════════════════
// Webhook envelope
// ═══════════════════════════════════════════════════════════════

export const RazorpayWebhookEnvelopeSchema = z.object({
  entity: z.literal('event'),
  account_id: z.string().optional(),
  event: z.string(),
  contains: z.array(z.string()).default([]),
  payload: z.record(z.string(), z.unknown()),
  created_at: z.number(),
  id: z.string().optional(),
});
export type RazorpayWebhookEnvelope = z.infer<typeof RazorpayWebhookEnvelopeSchema>;

// ═══════════════════════════════════════════════════════════════
// Public API DTOs — inbound from customer app
// ═══════════════════════════════════════════════════════════════

export class CreatePaymentOrderDto {
  @ApiProperty({ description: 'Checkout session ID owned by the caller' })
  checkoutSessionId!: string;

  @ApiProperty({ required: false, description: 'Optional freeform notes' })
  notes?: Record<string, string>;
}

export class VerifyPaymentDto {
  @ApiProperty()
  paymentId!: string; // internal payment.id

  @ApiProperty({ description: 'razorpay_order_id from checkout' })
  razorpayOrderId!: string;

  @ApiProperty({ description: 'razorpay_payment_id from checkout' })
  razorpayPaymentId!: string;

  @ApiProperty({ description: 'razorpay_signature returned by Checkout SDK' })
  razorpaySignature!: string;
}

export class CreateRefundDto {
  @ApiProperty({ description: 'Payment (internal) ID' })
  paymentId!: string;

  @ApiProperty({
    required: false,
    description: 'Amount in rupees. Omit for full refund.',
  })
  amount?: number;

  @ApiProperty({ required: false })
  reason?: string;

  @ApiProperty({ required: false, enum: ['normal', 'optimum'] })
  speed?: 'normal' | 'optimum';
}

export class PaymentOrderResponseDto {
  @ApiProperty() paymentId!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty() razorpayKeyId!: string;
  @ApiProperty() razorpayOrderId!: string;
  @ApiProperty() amount!: number; // paise
  @ApiProperty() currency!: string;
  @ApiProperty() receipt!: string;
  @ApiProperty() status!: string;
  @ApiProperty() expiresAt!: string;
  @ApiProperty({ required: false }) notes?: Record<string, string>;
}

export class PaymentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() amount!: string;
  @ApiProperty() amountRefunded!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ required: false }) method?: string | null;
  @ApiProperty({ required: false }) gatewayOrderId?: string | null;
  @ApiProperty({ required: false }) gatewayPaymentId?: string | null;
  @ApiProperty({ required: false }) failureCode?: string | null;
  @ApiProperty({ required: false }) failureDescription?: string | null;
  @ApiProperty() createdAt!: string;
}

export class RefundResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() paymentId!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() amount!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ required: false }) gatewayRefundId?: string | null;
  @ApiProperty({ required: false }) reason?: string | null;
  @ApiProperty() isPartial!: boolean;
  @ApiProperty() createdAt!: string;
}

export class WebhookAckDto {
  @ApiProperty() success!: boolean;
  @ApiProperty() eventId!: string;
}

export const AMOUNT_BOUNDS = {
  MIN_RUPEES: MIN_PAYMENT_AMOUNT,
  MAX_RUPEES: MAX_PAYMENT_AMOUNT,
};

export { RAZORPAY_WEBHOOK_EVENTS };
