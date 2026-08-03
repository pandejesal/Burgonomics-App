import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError, UnauthorizedError } from '@common/errors';
import { Role } from '@common/enums';
import {
  REQUIRE_PERMISSIONS_KEY,
  REQUIRE_PERMISSIONS_MODE_KEY,
  type PermissionMode,
} from '../decorators/require-permissions.decorator';
import { PermissionResolverService } from '../services/permission-resolver.service';

/**
 * Permissions gate. Runs after JwtAuthGuard so `request.user` is
 * populated. Super-admin JWT role short-circuits every check to keep
 * platform operators unblocked while custom role assignments evolve.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly resolver: PermissionResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const mode: PermissionMode =
      this.reflector.getAllAndOverride<PermissionMode>(REQUIRE_PERMISSIONS_MODE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'all';

    const { user } = context.switchToHttp().getRequest();
    if (!user?.sub && !user?.id) throw new UnauthorizedError('Missing user context');

    const userRoles: string[] = user?.roles ?? [];
    if (userRoles.includes(Role.SUPER_ADMIN)) return true;

    const userId: string = user.sub ?? user.id;
    const ok =
      mode === 'all'
        ? await this.resolver.hasAll(userId, required)
        : await this.resolver.hasAny(userId, required);
    if (!ok) throw new ForbiddenError('Missing required permission');
    return true;
  }
}
