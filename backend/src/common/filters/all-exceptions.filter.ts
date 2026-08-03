import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { CORRELATION_ID_HEADER } from '@common/constants';
import { DomainError } from '@common/errors';
import { ERROR_CODES } from '@common/errors/error-codes';
import type { ProblemDetailsDto } from '@common/dto/problem-details.dto';

/**
 * Renders every uncaught throwable as an RFC-7807 Problem Details
 * response. Domain errors keep their status/code; other exceptions are
 * mapped to HTTP status via `HttpException`, and everything else is a
 * 500 with correlation ID for triage.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();
    const correlationId = req.headers?.[CORRELATION_ID_HEADER] ?? 'unknown';

    const problem = this.toProblem(exception, req.url, correlationId);

    if (problem.status >= 500) {
      this.logger.error({ err: exception, problem }, 'Unhandled exception');
    } else {
      this.logger.warn({ err: exception, problem }, 'Handled exception');
    }

    res.status(problem.status).type('application/problem+json').send(problem);
  }

  private toProblem(exception: unknown, url: string, correlationId: string): ProblemDetailsDto {
    if (exception instanceof DomainError) {
      return {
        type: 'about:blank',
        title: exception.name,
        status: exception.status,
        code: exception.code,
        detail: exception.message,
        instance: url,
        correlationId,
        retryable: exception.retryable,
        errors: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const detail =
        typeof response === 'string' ? response : (response as Record<string, unknown>)?.message;
      return {
        type: 'about:blank',
        title: exception.name,
        status,
        code: httpStatusToCode(status),
        detail: Array.isArray(detail) ? detail.join('; ') : (detail as string | undefined),
        instance: url,
        correlationId,
        errors: typeof response === 'object' ? (response as Record<string, unknown>) : undefined,
      };
    }

    return {
      type: 'about:blank',
      title: 'InternalServerError',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ERROR_CODES.INTERNAL_ERROR,
      detail: 'An unexpected error occurred.',
      instance: url,
      correlationId,
    };
  }
}

function httpStatusToCode(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ERROR_CODES.VALIDATION_FAILED;
    case HttpStatus.UNAUTHORIZED:
      return ERROR_CODES.UNAUTHORIZED;
    case HttpStatus.FORBIDDEN:
      return ERROR_CODES.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ERROR_CODES.NOT_FOUND;
    case HttpStatus.CONFLICT:
      return ERROR_CODES.CONFLICT;
    case HttpStatus.REQUEST_TIMEOUT:
      return ERROR_CODES.TIMEOUT;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ERROR_CODES.RATE_LIMITED;
    default:
      return ERROR_CODES.INTERNAL_ERROR;
  }
}
