import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { QUEUE_NAMES } from '@infra/queue/queue.constants';
import { StorageService } from '@infra/storage/storage.service';
import {
  REPORT_REPOSITORY,
  type IReportRepository,
} from '../repositories/interfaces/report-repository.interface';
import { ReportGeneratorRegistry } from '../services/report-generator.registry';
import { ReportExporterService } from '../services/report-exporter.service';
import type { ReportJobPayload } from '../services/reports.service';
import type { ReportFormat, ReportType } from '../constants';

@Processor(QUEUE_NAMES.REPORTS_GENERATE)
@Injectable()
export class ReportConsumer extends WorkerHost {
  private readonly logger = new Logger(ReportConsumer.name);

  constructor(
    @Inject(REPORT_REPOSITORY) private readonly repo: IReportRepository,
    private readonly registry: ReportGeneratorRegistry,
    private readonly exporter: ReportExporterService,
    private readonly storage: StorageService,
  ) {
    super();
  }

  async process(job: Job<ReportJobPayload>): Promise<void> {
    const record = await this.repo.findById(job.data.reportId);
    if (!record) return;

    await this.repo.markRunning(record.id);
    try {
      const params = record.params ?? {};
      const from = new Date((params as Record<string, string>).from);
      const to = new Date((params as Record<string, string>).to);
      const storeId = (params as Record<string, string>).storeId;
      const filters =
        ((params as Record<string, unknown>).filters as Record<string, unknown> | undefined) ??
        undefined;
      const rows = await this.registry.generate(record.type as ReportType, {
        from,
        to,
        storeId,
        filters,
      });
      const rendered = this.exporter.render(
        record.type as ReportType,
        record.format as ReportFormat,
        rows,
      );
      const key = `reports/${record.id}.${rendered.extension}`;
      const { url } = await this.storage.putObject({
        key,
        body: rendered.buffer,
        contentType: rendered.contentType,
      });
      await this.repo.markCompleted(record.id, {
        fileUrl: url,
        fileSize: rendered.buffer.length,
        rowCount: rendered.rowCount,
      });
    } catch (err) {
      this.logger.error(`report ${record.id} failed: ${(err as Error).message}`);
      await this.repo.markFailed(record.id, (err as Error).message);
      throw err;
    }
  }
}
