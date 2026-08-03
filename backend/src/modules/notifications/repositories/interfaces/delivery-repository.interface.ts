import type { DeliveryStatus, NotificationDelivery } from '@prisma/client';

export const DELIVERY_REPOSITORY = Symbol('DELIVERY_REPOSITORY');

export interface RecordDeliveryInput {
  notificationId: string;
  channel: string;
  deviceId?: string;
  status: DeliveryStatus;
  attempt: number;
  providerRef?: string | null;
  providerCode?: string | null;
  providerMessage?: string | null;
  latencyMs?: number | null;
  ackAt?: Date | null;
}

export interface IDeliveryRepository {
  record(input: RecordDeliveryInput): Promise<NotificationDelivery>;
  listForNotification(notificationId: string): Promise<NotificationDelivery[]>;
  countByStatusSince(status: DeliveryStatus, since: Date): Promise<number>;
}
