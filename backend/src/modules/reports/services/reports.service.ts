import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@infra/queue/queue.constants';
import { NotFoundError } from '@common/errors';
import {
  REPORT_REPOSITORY,
  type IReportRepository,
} from '../repositories/interfaces/report-repository.interface';
import type { CreateReportDto, ListReportsQueryDto } from '../dto';

export interface ReportJobPayload {
  reportId: string;
}

@Injectable()
export class ReportsService {
  constructor(
    @Inject(REPORT_REPOSITORY) private readonly repo: IReportRepository,
    @InjectQueue(QUEUE_NAMES.REPORTS_GENERATE) private readonly queue: Queue<ReportJobPayload>,
  ) {}

  async enqueue(input: CreateReportDto & { requestedBy?: string }) {
    const job = await this.repo.enqueue(input);
    await this.queue.add(
      'generate',
      { reportId: job.id },
      { jobId: job.id, removeOnComplete: { count: 100 }, removeOnFail: false },
    );
    return job;
  }

  list(filter: ListReportsQueryDto) {
    return this.repo.list(filter);
  }

  async get(id: string) {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundError('Report');
    return row;
  }
}
