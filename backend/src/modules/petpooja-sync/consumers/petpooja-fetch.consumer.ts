import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { QUEUE_NAMES } from '@infra/queue/queue.constants';
import { PetpoojaSyncService } from '../services/petpooja-sync.service';
import type { PetpoojaFetchJob } from '../dto';

@Processor(QUEUE_NAMES.PETPOOJA_FETCH_MENU)
export class PetpoojaFetchConsumer extends WorkerHost {
  private readonly logger = new Logger(PetpoojaFetchConsumer.name);
  constructor(private readonly sync: PetpoojaSyncService) {
    super();
  }

  async process(job: Job<PetpoojaFetchJob>): Promise<void> {
    this.logger.log(`Processing PETPOOJA fetch job scope=${job.data.scope}`);
    await this.sync.runScope(job.data);
  }
}
