import { Injectable } from '@nestjs/common';
import type {
  DeliveryStatus,
  NotificationChannel,
  NotificationDelivery,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import type {
  IDeliveryRepository,
  RecordDeliveryInput,
} from '../interfaces/delivery-repository.interface';

@Injectable()
export class DeliveryPrismaRepository implements IDeliveryRepository {
  constructor(private readonly prisma: PrismaService) {}

  record(input: RecordDeliveryInput): Promise<NotificationDelivery> {
    return this.prisma.notificationDelivery.create({
      data: {
        notificationId: input.notificationId,
        channel: input.channel as NotificationChannel,
        deviceId: input.deviceId ?? null,
        status: input.status,
        attempt: input.attempt,
        providerRef: input.providerRef ?? null,
        providerCode: input.providerCode ?? null,
        providerMessage: input.providerMessage ?? null,
        latencyMs: input.latencyMs ?? null,
        ackAt: input.ackAt ?? null,
      } satisfies Prisma.NotificationDeliveryUncheckedCreateInput,
    });
  }

  listForNotification(notificationId: string) {
    return this.prisma.notificationDelivery.findMany({
      where: { notificationId },
      orderBy: { attemptedAt: 'asc' },
    });
  }

  countByStatusSince(status: DeliveryStatus, since: Date): Promise<number> {
    return this.prisma.notificationDelivery.count({
      where: { status, attemptedAt: { gte: since } },
    });
  }
}
