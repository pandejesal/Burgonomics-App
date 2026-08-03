import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSIONS_KEY = 'rbac:requirePermissions';
export const REQUIRE_PERMISSIONS_MODE_KEY = 'rbac:requirePermissionsMode';

export type PermissionMode = 'any' | 'all';

/**
 * Guards a route so it only fires when the caller holds ALL supplied
 * permission keys. Use `RequireAnyPermission` when a subset suffices.
 */
export const RequirePermissions = (...permissions: string[]) => {
  return (target: object, key?: string | symbol, descriptor?: TypedPropertyDescriptor<any>) => {
    SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions)(
      target,
      key as string,
      descriptor as TypedPropertyDescriptor<any>,
    );
    SetMetadata(REQUIRE_PERMISSIONS_MODE_KEY, 'all' as PermissionMode)(
      target,
      key as string,
      descriptor as TypedPropertyDescriptor<any>,
    );
  };
};

export const RequireAnyPermission = (...permissions: string[]) => {
  return (target: object, key?: string | symbol, descriptor?: TypedPropertyDescriptor<any>) => {
    SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions)(
      target,
      key as string,
      descriptor as TypedPropertyDescriptor<any>,
    );
    SetMetadata(REQUIRE_PERMISSIONS_MODE_KEY, 'any' as PermissionMode)(
      target,
      key as string,
      descriptor as TypedPropertyDescriptor<any>,
    );
  };
};
