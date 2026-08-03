import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';

export const ADMIN_PERMISSIONS_KEY = 'admin_permissions';
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(ADMIN_PERMISSIONS_KEY, permissions);

export const ADMIN_ROLES_KEY = 'admin_roles';
export const RequireRoles = (...roles: string[]) => SetMetadata(ADMIN_ROLES_KEY, roles);

export const CurrentAdmin = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
