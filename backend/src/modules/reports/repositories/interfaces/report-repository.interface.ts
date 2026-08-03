import type { ReportJobEntity } from '../../entities/report-job.entity';
import type { CreateReportDto, ListReportsQueryDto } from '../../dto';

export const REPORT_REPOSITORY = Symbol('REPORT_REPOSITORY');

export interface ReportsListResult {
  items: ReportJobEntity[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

export interface IReportRepository {
  enqueue(input: CreateReportDto & { requestedBy?: string }): Promise<ReportJobEntity>;
  list(filter: ListReportsQueryDto): Promise<ReportsListResult>;
  findById(id: string): Promise<ReportJobEntity | null>;
  markRunning(id: string): Promise<void>;
  markCompleted(
    id: string,
    output: { fileUrl: string; fileSize: number; rowCount: number },
  ): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
}
