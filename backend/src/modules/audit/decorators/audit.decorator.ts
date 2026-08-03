import { SetMetadata } from '@nestjs/common';

export const AUDIT_METADATA_KEY = 'audit:metadata';

export interface AuditMetadata {
  action: string;
  resourceType: string;
  /** Optional path to pull the resource id from — `params.id`, `body.id`, etc. */
  resourceIdFrom?: string;
}

/**
 * Marks a controller handler so the AuditInterceptor emits an audit
 * event on successful completion. Use one of the fine-grained aliases
 * below when possible for readability.
 */
export const Audit = (metadata: AuditMetadata) => SetMetadata(AUDIT_METADATA_KEY, metadata);
