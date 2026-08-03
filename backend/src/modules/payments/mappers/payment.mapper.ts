import type { Payment, Refund } from '@prisma/client';
import type {
  PaymentOrderResponseDto,
  PaymentResponseDto,
  RefundResponseDto,
} from '../dto/payments.dto';

export class PaymentMapper {
  static toResponse(p: Payment): PaymentResponseDto {
    return {
      id: p.id,
      orderId: p.orderId,
      status: p.status,
      amount: p.amount.toString(),
      amountRefunded: p.amountRefunded.toString(),
      currency: p.currency,
      method: p.method,
      gatewayOrderId: p.gatewayOrderId,
      gatewayPaymentId: p.gatewayPaymentId,
      failureCode: p.failureCode,
      failureDescription: p.failureDescription,
      createdAt: p.createdAt.toISOString(),
    };
  }

  static toOrderResponse(p: Payment, razorpayKeyId: string): PaymentOrderResponseDto {
    if (!p.gatewayOrderId) {
      throw new Error('Payment does not have a gateway order id yet');
    }
    return {
      paymentId: p.id,
      orderId: p.orderId,
      razorpayKeyId,
      razorpayOrderId: p.gatewayOrderId,
      amount: Math.round(Number(p.amount) * 100),
      currency: p.currency,
      receipt: p.receipt,
      status: p.status,
      expiresAt: (p.expiresAt ?? new Date()).toISOString(),
      notes: (p.notes as Record<string, string> | null) ?? undefined,
    };
  }

  static toRefundResponse(r: Refund): RefundResponseDto {
    return {
      id: r.id,
      paymentId: r.paymentId,
      orderId: r.orderId,
      status: r.status,
      amount: r.amount.toString(),
      currency: r.currency,
      gatewayRefundId: r.gatewayRefundId,
      reason: r.reason,
      isPartial: r.isPartial,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
