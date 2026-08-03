import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { QUEUE_NAMES } from '@infra/queue/queue.constants';
import type { StockToggleJob } from '../dto';

@Processor(QUEUE_NAMES.PETPOOJA_STOCK_TOGGLE)
export class PetpoojaStockConsumer extends WorkerHost {
  private readonly logger = new Logger(PetpoojaStockConsumer.name);

  async process(job: Job<StockToggleJob>): Promise<void> {
    // Wired to PETPOOJA HTTP + ProductsService.applyStockUpdate in Phase 4.
    this.logger.log(`Stock toggle received for petpoojaItem=${job.data.productPetpoojaId}`);
  }
}
