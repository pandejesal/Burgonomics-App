import type { MenuSyncLog, MenuSyncStatus } from '@prisma/client';

export const SYNC_LOG_REPOSITORY = Symbol('SYNC_LOG_REPOSITORY');

export interface StartSyncInput {
  syncType: string;
  storeId?: string | null;
  correlationId?: string | null;
}

export interface FinishSyncInput {
  id: string;
  status: MenuSyncStatus;
  itemsCreated?: number;
  itemsUpdated?: number;
  itemsDeleted?: number;
  conflicts?: number;
  version?: string | null;
  errorMessage?: string | null;
}

export interface ISyncLogRepository {
  start(input: StartSyncInput): Promise<MenuSyncLog>;
  finish(input: FinishSyncInput): Promise<MenuSyncLog>;
  latest(syncType: string, storeId?: string | null): Promise<MenuSyncLog | null>;
  history(limit: number): Promise<MenuSyncLog[]>;
}
