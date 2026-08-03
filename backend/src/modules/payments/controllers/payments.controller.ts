import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Idempotent } from '@common/decorators/idempotent.decorator';
import { PaymentsService } from '../services/payments.service';
import { RefundsService } from '../services/refunds.service';
import { PaymentMapper } from '../mappers/payment.mapper';
import {
  CreatePaymentOrderDto,
  CreateRefundDto,
  PaymentOrderResponseDto,
  PaymentResponseDto,
  RefundResponseDto,
  VerifyPaymentDto,
} from '../dto/payments.dto';

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly refunds: RefundsService,
  ) {}

  @Post('orders')
  @Idempotent()
  @ApiOperation({ summary: 'Create a Razorpay order for a locked checkout' })
  async createOrder(
    @CurrentUser('id') userId: string,
    @Body() body: CreatePaymentOrderDto,
  ): Promise<PaymentOrderResponseDto> {
    const payment = await this.payments.createOrder({
      userId,
      checkoutSessionId: body.checkoutSessionId,
      notes: body.notes,
    });
    return PaymentMapper.toOrderResponse(payment, this.payments.publishableKey());
  }

  @Post('verify')
  @Idempotent()
  @ApiOperation({ summary: 'Verify a Razorpay checkout callback' })
  async verify(
    @CurrentUser('id') userId: string,
    @Body() body: VerifyPaymentDto,
  ): Promise<PaymentResponseDto> {
    const payment = await this.payments.verify({
      paymentId: body.paymentId,
      razorpayOrderId: body.razorpayOrderId,
      razorpayPaymentId: body.razorpayPaymentId,
      razorpaySignature: body.razorpaySignature,
    });
    if (payment.userId !== userId) {
      // Defense in depth — verify only for the caller's own payment.
      throw new Error('Not your payment');
    }
    return PaymentMapper.toResponse(payment);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a payment' })
  async get(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<PaymentResponseDto> {
    const p = await this.payments.getById(id, userId);
    return PaymentMapper.toResponse(p);
  }

  @Get()
  @ApiOperation({ summary: 'List the caller’s payments' })
  async list(@CurrentUser('id') userId: string): Promise<PaymentResponseDto[]> {
    const rows = await this.payments.listForUser(userId);
    return rows.map((r) => PaymentMapper.toResponse(r));
  }

  @Post('refunds')
  @Idempotent()
  @ApiOperation({ summary: 'Request a refund (customer-initiated)' })
  async refund(
    @CurrentUser('id') userId: string,
    @Body() body: CreateRefundDto,
  ): Promise<RefundResponseDto> {
    // Ownership check before any gateway call.
    await this.payments.getById(body.paymentId, userId);
    const refund = await this.refunds.createRefund({
      paymentId: body.paymentId,
      amount: body.amount,
      reason: body.reason,
      speed: body.speed,
      requestedBy: userId,
    });
    return PaymentMapper.toRefundResponse(refund);
  }

  @Get(':id/refunds')
  @ApiOperation({ summary: 'List refunds for a payment' })
  async listRefunds(
    @CurrentUser('id') userId: string,
    @Param('id') paymentId: string,
  ): Promise<RefundResponseDto[]> {
    await this.payments.getById(paymentId, userId);
    const rows = await this.refunds.listForPayment(paymentId);
    return rows.map((r) => PaymentMapper.toRefundResponse(r));
  }
}
