export interface AuditLogEntity {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  previousValue: unknown;
  newValue: unknown;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  correlationId: string | null;
  createdAt: Date;
}

export interface CreateAuditLogInput {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
}
