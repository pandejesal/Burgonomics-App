import type { Payment, PaymentWebhookEvent, PetpoojaWebhookEvent, Refund } from '@prisma/client';

export const ADMIN_OPS_REPOSITORY = Symbol('ADMIN_OPS_REPOSITORY');

export interface WebhookHistoryFilter {
  gateway: 'petpooja' | 'razorpay';
  status?: string;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}

export interface WebhookHistoryResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

export interface PaymentSearchFilter {
  status?: string;
  gatewayPaymentId?: string;
  orderId?: string;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}

export interface PaymentReconciliationSummary {
  count: number;
  totalPaise: number;
  refundedPaise: number;
  discrepancies: Array<{ paymentId: string; reason: string }>;
}

export interface DashboardCounts {
  ordersLast24h: number;
  ordersActive: number;
  paymentsCapturedLast24h: number;
  refundsPendingCount: number;
  petpoojaWebhooksPending: number;
  paymentWebhooksPending: number;
  realtimeSessionsActive: number;
  storesActive: number;
}

export interface IAdminOpsRepository {
  listPetpoojaWebhooks(
    filter: WebhookHistoryFilter,
  ): Promise<WebhookHistoryResult<PetpoojaWebhookEvent>>;
  getPetpoojaWebhook(id: string): Promise<PetpoojaWebhookEvent | null>;

  listPaymentWebhooks(
    filter: WebhookHistoryFilter,
  ): Promise<WebhookHistoryResult<PaymentWebhookEvent>>;
  getPaymentWebhook(id: string): Promise<PaymentWebhookEvent | null>;

  searchPayments(filter: PaymentSearchFilter): Promise<WebhookHistoryResult<Payment>>;
  listRecentRefunds(limit: number): Promise<Refund[]>;
  detectDuplicatePayments(
    windowMinutes: number,
  ): Promise<Array<{ orderId: string; count: number }>>;
  reconcilePayments(from: Date, to: Date): Promise<PaymentReconciliationSummary>;

  dashboardCounts(): Promise<DashboardCounts>;
}
