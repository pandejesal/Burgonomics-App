import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import type {
  IReportRepository,
  ReportsListResult,
} from '../interfaces/report-repository.interface';
import type { ReportJobEntity } from '../../entities/report-job.entity';
import type { CreateReportDto, ListReportsQueryDto } from '../../dto';

@Injectable()
export class ReportPrismaRepository implements IReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toEntity(row: {
    id: string;
    type: string;
    status: string;
    format: string;
    params: unknown;
    requestedBy: string | null;
    fileUrl: string | null;
    fileSize: number | null;
    rowCount: number | null;
    error: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): ReportJobEntity {
    return {
      ...row,
      type: row.type as ReportJobEntity['type'],
      status: row.status as ReportJobEntity['status'],
      format: row.format as ReportJobEntity['format'],
      params: (row.params as Record<string, unknown> | null) ?? null,
    };
  }

  async enqueue(input: CreateReportDto & { requestedBy?: string }): Promise<ReportJobEntity> {
    const row = await this.prisma.reportJob.create({
      data: {
        type: input.type,
        format: input.format,
        requestedBy: input.requestedBy,
        params: {
          from: input.from.toISOString(),
          to: input.to.toISOString(),
          storeId: input.storeId,
          filters: input.filters ?? {},
        } as Prisma.InputJsonValue,
      },
    });
    return this.toEntity(row);
  }

  async list(filter: ListReportsQueryDto): Promise<ReportsListResult> {
    const where: Prisma.ReportJobWhereInput = {};
    if (filter.type) where.type = filter.type;
    if (filter.status) where.status = filter.status;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.reportJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.prisma.reportJob.count({ where }),
    ]);
    return {
      items: rows.map((r) => this.toEntity(r)),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
      hasNext: filter.page * filter.pageSize < total,
    };
  }

  async findById(id: string): Promise<ReportJobEntity | null> {
    const row = await this.prisma.reportJob.findUnique({ where: { id } });
    return row ? this.toEntity(row) : null;
  }

  async markRunning(id: string): Promise<void> {
    await this.prisma.reportJob.update({
      where: { id },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
  }

  async markCompleted(
    id: string,
    output: { fileUrl: string; fileSize: number; rowCount: number },
  ): Promise<void> {
    await this.prisma.reportJob.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        fileUrl: output.fileUrl,
        fileSize: output.fileSize,
        rowCount: output.rowCount,
      },
    });
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.prisma.reportJob.update({
      where: { id },
      data: { status: 'FAILED', completedAt: new Date(), error: error.slice(0, 2000) },
    });
  }
}
