import type { AuditLogEntity, CreateAuditLogInput } from '../../entities/audit-log.entity';
import type { ListAuditQueryDto } from '../../dto';

export const AUDIT_REPOSITORY = Symbol('AUDIT_REPOSITORY');

export interface AuditListResult {
  items: AuditLogEntity[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

export interface IAuditRepository {
  create(input: CreateAuditLogInput): Promise<AuditLogEntity>;
  list(filter: ListAuditQueryDto): Promise<AuditListResult>;
  stream(
    filter: ListAuditQueryDto,
    batch: number,
    onBatch: (rows: AuditLogEntity[]) => Promise<void>,
  ): Promise<void>;
}
