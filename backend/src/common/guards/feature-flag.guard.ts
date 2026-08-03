import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_FLAG_KEY } from '@common/decorators/feature-flag.decorator';
import { INJECTION_TOKENS } from '@common/constants';
import { DomainError } from '@common/errors';
import { ERROR_CODES } from '@common/errors/error-codes';
import { HttpStatus } from '@nestjs/common';

export interface FeatureFlagPort {
  isEnabled(flag: string, ctx?: Record<string, unknown>): Promise<boolean> | boolean;
}

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(INJECTION_TOKENS.FEATURE_FLAG_PROVIDER) private readonly flags: FeatureFlagPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const flag = this.reflector.getAllAndOverride<string>(FEATURE_FLAG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!flag) return true;
    const enabled = await this.flags.isEnabled(flag);
    if (!enabled) {
      throw new DomainError(`Feature "${flag}" is disabled`, {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: ERROR_CODES.FEATURE_DISABLED,
      });
    }
    return true;
  }
}
