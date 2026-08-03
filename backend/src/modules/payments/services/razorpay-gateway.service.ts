import { Injectable, Logger } from '@nestjs/common';
import { RazorpayHttpClient } from '../http/razorpay-http.client';
import { RAZORPAY_ENDPOINTS, RAZORPAY_METRIC_LABELS } from '../constants';
import {
  RazorpayCreateOrderRequestSchema,
  RazorpayCreateRefundRequestSchema,
  RazorpayOrderResponseSchema,
  RazorpayPaymentResponseSchema,
  RazorpayRefundResponseSchema,
  type RazorpayCreateOrderRequest,
  type RazorpayCreateRefundRequest,
  type RazorpayOrderResponse,
  type RazorpayPaymentResponse,
  type RazorpayRefundResponse,
} from '../dto/payments.dto';

/**
 * Typed Razorpay operations. Every method validates request payloads
 * with Zod, dispatches through the HTTP client, and validates responses
 * back into domain-safe types. No module outside Payments may call
 * these methods directly.
 */
@Injectable()
export class RazorpayGatewayService {
  private readonly logger = new Logger(RazorpayGatewayService.name);

  constructor(private readonly http: RazorpayHttpClient) {}

  async createOrder(
    payload: RazorpayCreateOrderRequest,
    correlationId?: string,
    idempotencyKey?: string,
  ): Promise<RazorpayOrderResponse> {
    const body = RazorpayCreateOrderRequestSchema.parse(payload);
    const raw = await this.http.postJson<unknown>(RAZORPAY_ENDPOINTS.CREATE_ORDER, body, {
      metricLabel: RAZORPAY_METRIC_LABELS.CREATE_ORDER,
      correlationId,
      idempotencyKey,
    });
    return RazorpayOrderResponseSchema.parse(raw);
  }

  async fetchOrder(id: string, correlationId?: string): Promise<RazorpayOrderResponse> {
    const raw = await this.http.getJson<unknown>(RAZORPAY_ENDPOINTS.FETCH_ORDER(id), {
      metricLabel: RAZORPAY_METRIC_LABELS.FETCH_ORDER,
      correlationId,
    });
    return RazorpayOrderResponseSchema.parse(raw);
  }

  async fetchPayment(id: string, correlationId?: string): Promise<RazorpayPaymentResponse> {
    const raw = await this.http.getJson<unknown>(RAZORPAY_ENDPOINTS.FETCH_PAYMENT(id), {
      metricLabel: RAZORPAY_METRIC_LABELS.FETCH_PAYMENT,
      correlationId,
    });
    return RazorpayPaymentResponseSchema.parse(raw);
  }

  async capturePayment(
    id: string,
    amount: number,
    currency: string,
    correlationId?: string,
  ): Promise<RazorpayPaymentResponse> {
    const raw = await this.http.postJson<unknown>(
      RAZORPAY_ENDPOINTS.CAPTURE_PAYMENT(id),
      { amount, currency },
      {
        metricLabel: RAZORPAY_METRIC_LABELS.CAPTURE_PAYMENT,
        correlationId,
        idempotencyKey: `capture:${id}`,
      },
    );
    return RazorpayPaymentResponseSchema.parse(raw);
  }

  async createRefund(
    paymentId: string,
    payload: RazorpayCreateRefundRequest,
    correlationId?: string,
    idempotencyKey?: string,
  ): Promise<RazorpayRefundResponse> {
    const body = RazorpayCreateRefundRequestSchema.parse(payload);
    const raw = await this.http.postJson<unknown>(
      RAZORPAY_ENDPOINTS.CREATE_REFUND(paymentId),
      body,
      {
        metricLabel: RAZORPAY_METRIC_LABELS.CREATE_REFUND,
        correlationId,
        idempotencyKey,
      },
    );
    return RazorpayRefundResponseSchema.parse(raw);
  }

  async fetchRefund(id: string, correlationId?: string): Promise<RazorpayRefundResponse> {
    const raw = await this.http.getJson<unknown>(RAZORPAY_ENDPOINTS.FETCH_REFUND(id), {
      metricLabel: RAZORPAY_METRIC_LABELS.FETCH_REFUND,
      correlationId,
    });
    return RazorpayRefundResponseSchema.parse(raw);
  }

  breakerStates(): Record<string, string> {
    return this.http.breakerStates();
  }
}
