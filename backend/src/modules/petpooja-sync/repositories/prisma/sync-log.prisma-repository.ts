import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import type {
  FinishSyncInput,
  ISyncLogRepository,
  StartSyncInput,
} from '../interfaces/sync-log-repository.interface';

@Injectable()
export class SyncLogPrismaRepository implements ISyncLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  start(input: StartSyncInput) {
    return this.prisma.menuSyncLog.create({
      data: {
        syncType: input.syncType,
        storeId: input.storeId ?? null,
        correlationId: input.correlationId ?? null,
        status: 'RUNNING',
      },
    });
  }

  finish(input: FinishSyncInput) {
    return this.prisma.menuSyncLog.update({
      where: { id: input.id },
      data: {
        status: input.status,
        itemsCreated: input.itemsCreated ?? 0,
        itemsUpdated: input.itemsUpdated ?? 0,
        itemsDeleted: input.itemsDeleted ?? 0,
        conflicts: input.conflicts ?? 0,
        version: input.version ?? null,
        errorMessage: input.errorMessage ?? null,
        finishedAt: new Date(),
      },
    });
  }

  latest(syncType: string, storeId?: string | null) {
    return this.prisma.menuSyncLog.findFirst({
      where: { syncType, ...(storeId ? { storeId } : {}) },
      orderBy: { startedAt: 'desc' },
    });
  }

  history(limit: number) {
    return this.prisma.menuSyncLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }
}
