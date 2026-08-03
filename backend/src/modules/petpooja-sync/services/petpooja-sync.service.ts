import { Inject, Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@infra/queue/queue.constants';
import { DomainEventBus } from '@infra/events/domain-event-bus';
import { PrismaService } from '@infra/prisma/prisma.service';
import { MenuCacheService } from '../../menu/services/menu-cache.service';
import { PetpoojaService } from '../../petpooja/services/petpooja.service';
import { PetpoojaAdapter } from '../../petpooja/services/petpooja-adapter.service';
import type { PetpoojaFetchJob, StockToggleJob, SyncScope } from '../dto';
import { CATALOG_SYNC_EVENTS } from '../dto';
import {
  SYNC_LOG_REPOSITORY,
  type ISyncLogRepository,
} from '../repositories/interfaces/sync-log-repository.interface';

/**
 * Synchronization orchestrator. Owns the lifecycle of a sync run
 * (log start/finish, event emission, cache invalidation) and
 * delegates the actual PETPOOJA I/O to the `PetpoojaAdapter`. This
 * service does NOT contain any HTTP or PETPOOJA DTO knowledge.
 */
@Injectable()
export class PetpoojaSyncService {
  private readonly logger = new Logger(PetpoojaSyncService.name);

  constructor(
    @Inject(SYNC_LOG_REPOSITORY) private readonly logs: ISyncLogRepository,
    private readonly bus: DomainEventBus,
    private readonly menuCache: MenuCacheService,
    private readonly prisma: PrismaService,
    private readonly petpooja: PetpoojaService,
    private readonly adapter: PetpoojaAdapter,
    @InjectQueue(QUEUE_NAMES.PETPOOJA_FETCH_MENU) private readonly fetchQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PETPOOJA_STOCK_TOGGLE) private readonly stockQueue: Queue,
  ) {}

  // ─── Queue producers ─────────────────────────────────────────
  enqueueFetch(job: PetpoojaFetchJob) {
    return this.fetchQueue.add(job.scope, job, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    });
  }

  enqueueStockToggle(job: StockToggleJob) {
    return this.stockQueue.add('toggle', job, { attempts: 5 });
  }

  // ─── Consumer entry-point ────────────────────────────────────
  async runScope(job: PetpoojaFetchJob): Promise<void> {
    const log = await this.logs.start({
      syncType: job.scope,
      storeId: job.storeId ?? null,
      correlationId: job.correlationId ?? null,
    });
    this.bus.publish(CATALOG_SYNC_EVENTS.STARTED, {
      scope: job.scope,
      storeId: job.storeId,
      correlationId: job.correlationId,
    });
    try {
      await this.dispatch(job);
      await this.menuCache.invalidate(job.storeId);
      const finished = await this.logs.finish({
        id: log.id,
        status: 'SUCCESS',
        version: `${Date.now()}`,
      });
      this.bus.publish(CATALOG_SYNC_EVENTS.MENU_SYNCED, {
        storeId: job.storeId,
        syncType: job.scope,
        version: finished.version,
        correlationId: job.correlationId,
      });
    } catch (err) {
      await this.logs.finish({
        id: log.id,
        status: 'FAILED',
        errorMessage: (err as Error).message,
      });
      this.bus.publish(CATALOG_SYNC_EVENTS.FAILED, {
        scope: job.scope,
        storeId: job.storeId,
        error: (err as Error).message,
      });
      throw err;
    }
  }

  private async dispatch(job: PetpoojaFetchJob): Promise<void> {
    switch (job.scope) {
      case 'FULL':
      case 'CATEGORIES':
      case 'PRODUCTS':
      case 'MODIFIERS':
      case 'OFFERS':
        await this.pullMenuAndIngest(job);
        return;
      case 'STORES':
      case 'STORE_STATUS':
        await this.pullMenuAndIngest(job);
        return;
      case 'STOCK':
        // PETPOOJA doesn't expose a bulk stock pull — stock is
        // reconciled via inbound stock_update webhooks and included in
        // the full menu envelope. Re-run FULL if a hard reconciliation
        // is needed.
        this.logger.log('STOCK sync scope has no dedicated PETPOOJA endpoint; use FULL.');
        return;
      default: {
        const exhaustive: never = job.scope;
        throw new NotImplementedException(`Unknown sync scope: ${exhaustive as SyncScope}`);
      }
    }
  }

  private async pullMenuAndIngest(job: PetpoojaFetchJob): Promise<void> {
    const stores = job.storeId
      ? [await this.prisma.store.findUniqueOrThrow({ where: { id: job.storeId } })]
      : await this.prisma.store.findMany();
    for (const store of stores) {
      const menu = await this.petpooja.fetchMenu(store.petpoojaRestId, job.correlationId);
      await this.adapter.ingestPushMenu(menu as never, job.correlationId);
    }
  }

  // ─── Read-side ───────────────────────────────────────────────
  latest(scope: SyncScope, storeId?: string) {
    return this.logs.latest(scope, storeId);
  }

  history(limit = 50) {
    return this.logs.history(limit);
  }

  async health(): Promise<{ ok: boolean; lastSuccessAt: Date | null }> {
    const last = await this.logs.latest('FULL');
    return { ok: last?.status === 'SUCCESS', lastSuccessAt: last?.finishedAt ?? null };
  }
}
