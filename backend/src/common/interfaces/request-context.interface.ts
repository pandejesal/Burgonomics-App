export interface RequestContext {
  correlationId: string;
  userId?: string;
  roles?: string[];
  idempotencyKey?: string;
}
