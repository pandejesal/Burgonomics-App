import { HttpStatus } from '@nestjs/common';
import { ERROR_CODES, type ErrorCode } from './error-codes';

/**
 * Base class for every expected business-domain error. Handled by
 * `AllExceptionsFilter` and rendered as RFC-7807 Problem Details.
 */
export class DomainError extends Error {
  readonly status: HttpStatus;
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    opts: {
      status?: HttpStatus;
      code?: ErrorCode;
      retryable?: boolean;
      details?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.name = this.constructor.name;
    this.status = opts.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
    this.code = opts.code ?? ERROR_CODES.INTERNAL_ERROR;
    this.retryable = opts.retryable ?? false;
    this.details = opts.details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class NotFoundError extends DomainError {
  constructor(message = 'Resource not found', details?: Record<string, unknown>) {
    super(message, { status: HttpStatus.NOT_FOUND, code: ERROR_CODES.NOT_FOUND, details });
  }
}

export class ValidationError extends DomainError {
  constructor(message = 'Validation failed', details?: Record<string, unknown>) {
    super(message, {
      status: HttpStatus.BAD_REQUEST,
      code: ERROR_CODES.VALIDATION_FAILED,
      details,
    });
  }
}

export class ConflictError extends DomainError {
  constructor(message = 'Conflict', details?: Record<string, unknown>) {
    super(message, { status: HttpStatus.CONFLICT, code: ERROR_CODES.CONFLICT, details });
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Unauthorized') {
    super(message, { status: HttpStatus.UNAUTHORIZED, code: ERROR_CODES.UNAUTHORIZED });
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'Forbidden') {
    super(message, { status: HttpStatus.FORBIDDEN, code: ERROR_CODES.FORBIDDEN });
  }
}

export class IntegrationError extends DomainError {
  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message, { status: HttpStatus.BAD_GATEWAY, code, retryable: true, details });
  }
}
