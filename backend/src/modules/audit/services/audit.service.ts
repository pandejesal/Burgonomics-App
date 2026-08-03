import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import {
  AUDIT_REPOSITORY,
  type IAuditRepository,
} from '../repositories/interfaces/audit-repository.interface';
import type { AuditLogEntity, CreateAuditLogInput } from '../entities/audit-log.entity';
import type { ListAuditQueryDto } from '../dto';

/**
 * Central audit ingestion service. Writes are best-effort and MUST
 * never bubble errors into the caller — audit failures are logged and
 * swallowed. Reads flow through the same repository.
 */
@Injectable()
export class AuditService {
  constructor(
    @Inject(AUDIT_REPOSITORY) private readonly repo: IAuditRepository,
    private readonly logger: Logger,
  ) {}

  async record(input: CreateAuditLogInput): Promise<AuditLogEntity | null> {
    try {
      return await this.repo.create(input);
    } catch (err) {
      this.logger.error(
        {
          err: (err as Error).message,
          action: input.action,
          resource: input.resourceType,
        },
        'audit-record-failed',
      );
      return null;
    }
  }

  list(filter: ListAuditQueryDto) {
    return this.repo.list(filter);
  }

  stream(
    filter: ListAuditQueryDto,
    batch: number,
    onBatch: (rows: AuditLogEntity[]) => Promise<void>,
  ) {
    return this.repo.stream(filter, batch, onBatch);
  }
}
