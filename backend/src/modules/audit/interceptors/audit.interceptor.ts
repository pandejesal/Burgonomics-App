import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuditService } from '../services/audit.service';
import { AUDIT_METADATA_KEY, type AuditMetadata } from '../decorators/audit.decorator';

/**
 * Emits an audit event when a handler decorated with `@Audit()`
 * completes successfully. Errors bypass the emission and are logged
 * by the AllExceptionsFilter with the same correlationId.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditMetadata | undefined>(AUDIT_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest();
    const actorId: string | null = req.user?.sub ?? req.user?.id ?? null;
    const actorRole: string | null =
      Array.isArray(req.user?.roles) && req.user.roles.length
        ? req.user.roles[0]
        : (req.user?.role ?? null);
    const ip: string | null = (req.ip ?? req.headers?.['x-forwarded-for'] ?? null) as string | null;
    const userAgent: string | null = (req.headers?.['user-agent'] ?? null) as string | null;
    const correlationId: string | null = (req.headers?.['x-correlation-id'] ?? null) as
      string | null;

    return next.handle().pipe(
      tap({
        next: (result) => {
          void this.audit.record({
            actorId,
            actorRole,
            action: meta.action,
            resourceType: meta.resourceType,
            resourceId: this.extractResourceId(req, result, meta.resourceIdFrom),
            metadata: {
              method: req.method,
              url: req.url,
              params: req.params,
              query: req.query,
            },
            newValue: this.safeBody(req.body),
            ip,
            userAgent,
            correlationId,
          });
        },
      }),
    );
  }

  private extractResourceId(
    req: { params?: Record<string, string>; body?: unknown },
    result: unknown,
    path?: string,
  ): string | null {
    if (!path) return req.params?.id ?? null;
    const segments = path.split('.');
    let cur: unknown = { params: req.params, body: req.body, result };
    for (const s of segments) {
      if (cur && typeof cur === 'object' && s in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[s];
      } else {
        return null;
      }
    }
    return typeof cur === 'string' ? cur : cur == null ? null : String(cur);
  }

  private safeBody(body: unknown): unknown {
    if (!body || typeof body !== 'object') return body ?? null;
    const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) };
    for (const k of Object.keys(clone)) {
      if (/password|secret|token|otp|key/i.test(k)) clone[k] = '[REDACTED]';
    }
    return clone;
  }
}
