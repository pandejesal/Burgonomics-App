import { Injectable } from '@nestjs/common';
import { PassThrough, Readable } from 'stream';
import { AuditService } from './audit.service';
import type { ExportAuditQueryDto } from '../dto';

/**
 * Streams audit log export payloads. CSV format uses RFC-4180 quoting;
 * JSON emits one object per line for ingestion into external SIEMs.
 */
@Injectable()
export class AuditExportService {
  private static readonly BATCH_SIZE = 500;

  constructor(private readonly audit: AuditService) {}

  async export(
    filter: ExportAuditQueryDto,
  ): Promise<{ stream: Readable; contentType: string; filename: string }> {
    const stream = new PassThrough();
    const contentType = filter.format === 'json' ? 'application/x-ndjson' : 'text/csv';
    const filename = `audit-${new Date().toISOString().slice(0, 10)}.${filter.format}`;

    if (filter.format === 'csv') {
      stream.write(this.csvHeader() + '\n');
    }

    // Fire-and-forget: the response returns immediately with the readable side.
    void (async () => {
      try {
        await this.audit.stream(filter, AuditExportService.BATCH_SIZE, async (rows) => {
          const chunk = rows
            .map((r) => (filter.format === 'json' ? JSON.stringify(r) : this.toCsvRow(r)))
            .join('\n');
          stream.write(chunk + '\n');
        });
        stream.end();
      } catch (err) {
        stream.destroy(err as Error);
      }
    })();

    return { stream, contentType, filename };
  }

  private csvHeader(): string {
    return [
      'id',
      'createdAt',
      'actorId',
      'actorRole',
      'action',
      'resourceType',
      'resourceId',
      'ip',
      'userAgent',
      'correlationId',
    ].join(',');
  }

  private toCsvRow(r: {
    id: string;
    createdAt: Date;
    actorId: string | null;
    actorRole: string | null;
    action: string;
    resourceType: string;
    resourceId: string | null;
    ip: string | null;
    userAgent: string | null;
    correlationId: string | null;
  }): string {
    return [
      r.id,
      r.createdAt.toISOString(),
      r.actorId ?? '',
      r.actorRole ?? '',
      r.action,
      r.resourceType,
      r.resourceId ?? '',
      r.ip ?? '',
      r.userAgent ?? '',
      r.correlationId ?? '',
    ]
      .map((v) => this.escape(String(v)))
      .join(',');
  }

  private escape(v: string): string {
    if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  }
}
