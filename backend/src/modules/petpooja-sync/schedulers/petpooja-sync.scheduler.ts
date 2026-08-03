import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PetpoojaSyncService } from '../services/petpooja-sync.service';

/**
 * Schedules recurring PETPOOJA pulls. Cron cadences here match the
 * frozen architecture: menu refresh every 15 minutes, stock every 5.
 * The scheduler simply enqueues — actual work happens on workers.
 */
@Injectable()
export class PetpoojaSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(PetpoojaSyncScheduler.name);

  constructor(private readonly sync: PetpoojaSyncService) {}

  onModuleInit(): void {
    this.logger.log('PETPOOJA sync scheduler online');
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncStock(): Promise<void> {
    await this.sync.enqueueFetch({ scope: 'STOCK' });
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async syncStoreStatus(): Promise<void> {
    await this.sync.enqueueFetch({ scope: 'STORE_STATUS' });
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async syncMenu(): Promise<void> {
    await this.sync.enqueueFetch({ scope: 'FULL' });
  }
}
