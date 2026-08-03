import type {
  Payment,
  PaymentAttempt,
  PaymentAttemptKind,
  PaymentStatus,
  Prisma,
} from '@prisma/client';

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');

export interface CreatePaymentInput {
  orderId: string;
  userId: string;
  receipt: string;
  amount: string; // decimal rupees
  currency: string;
  notes?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  expiresAt: Date;
  correlationId?: string;
}

export interface UpdateGatewayIdsInput {
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  method?: string | null;
  status?: PaymentStatus;
  failureCode?: string | null;
  failureDescription?: string | null;
  capturedAt?: Date | null;
  failedAt?: Date | null;
  verifiedAt?: Date | null;
}

export interface RecordAttemptInput {
  paymentId: string;
  action: PaymentAttemptKind;
  status: string;
  attemptNo?: number;
  gatewayCode?: string | null;
  gatewayMessage?: string | null;
  request?: Prisma.InputJsonValue | null;
  response?: Prisma.InputJsonValue | null;
  correlationId?: string | null;
}

export interface IPaymentRepository {
  create(input: CreatePaymentInput): Promise<Payment>;
  findById(id: string): Promise<Payment | null>;
  findByReceipt(receipt: string): Promise<Payment | null>;
  findByGatewayOrderId(id: string): Promise<Payment | null>;
  findByGatewayPaymentId(id: string): Promise<Payment | null>;
  findLatestForOrder(orderId: string): Promise<Payment | null>;
  listForUser(userId: string, limit?: number): Promise<Payment[]>;
  patch(id: string, patch: UpdateGatewayIdsInput): Promise<Payment>;
  incrementRefunded(id: string, delta: string): Promise<Payment>;
  recordAttempt(input: RecordAttemptInput): Promise<PaymentAttempt>;
  listAttempts(paymentId: string): Promise<PaymentAttempt[]>;
}
