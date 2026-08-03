import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import type { AuditListResult, IAuditRepository } from '../interfaces/audit-repository.interface';
import type { AuditLogEntity, CreateAuditLogInput } from '../../entities/audit-log.entity';
import type { ListAuditQueryDto } from '../../dto';

@Injectable()
export class AuditPrismaRepository implements IAuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toEntity(row: {
    id: string;
    actorId: string | null;
    actorRole: string | null;
    action: string;
    resourceType: string;
    resourceId: string | null;
    previousValue: unknown;
    newValue: unknown;
    metadata: unknown;
    ip: string | null;
    userAgent: string | null;
    correlationId: string | null;
    createdAt: Date;
  }): AuditLogEntity {
    return {
      id: row.id,
      actorId: row.actorId,
      actorRole: row.actorRole,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      previousValue: row.previousValue,
      newValue: row.newValue,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      ip: row.ip,
      userAgent: row.userAgent,
      correlationId: row.correlationId,
      createdAt: row.createdAt,
    };
  }

  async create(input: CreateAuditLogInput): Promise<AuditLogEntity> {
    const row = await this.prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        previousValue: (input.previousValue as Prisma.InputJsonValue) ?? undefined,
        newValue: (input.newValue as Prisma.InputJsonValue) ?? undefined,
        metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        correlationId: input.correlationId ?? null,
      },
    });
    return this.toEntity(row);
  }

  private toWhere(filter: ListAuditQueryDto): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};
    if (filter.actorId) where.actorId = filter.actorId;
    if (filter.action) where.action = { contains: filter.action, mode: 'insensitive' };
    if (filter.resourceType) where.resourceType = filter.resourceType;
    if (filter.resourceId) where.resourceId = filter.resourceId;
    if (filter.from || filter.to) {
      where.createdAt = {};
      if (filter.from) where.createdAt.gte = filter.from;
      if (filter.to) where.createdAt.lte = filter.to;
    }
    if (filter.q) {
      where.OR = [
        { action: { contains: filter.q, mode: 'insensitive' } },
        { resourceType: { contains: filter.q, mode: 'insensitive' } },
        { resourceId: { contains: filter.q, mode: 'insensitive' } },
        { correlationId: { contains: filter.q, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  async list(filter: ListAuditQueryDto): Promise<AuditListResult> {
    const where = this.toWhere(filter);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      items: rows.map((r) => this.toEntity(r)),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
      hasNext: filter.page * filter.pageSize < total,
    };
  }

  async stream(
    filter: ListAuditQueryDto,
    batch: number,
    onBatch: (rows: AuditLogEntity[]) => Promise<void>,
  ): Promise<void> {
    const where = this.toWhere(filter);
    let cursor: string | undefined;
    // Cursor-based pagination for streaming exports.
    // Falls back to page-based pagination for small result sets.
    while (true) {
      const rows = await this.prisma.auditLog.findMany({
        where,
        orderBy: { id: 'asc' },
        take: batch,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (rows.length === 0) break;
      await onBatch(rows.map((r) => this.toEntity(r)));
      cursor = rows[rows.length - 1]!.id;
      if (rows.length < batch) break;
    }
  }
}
