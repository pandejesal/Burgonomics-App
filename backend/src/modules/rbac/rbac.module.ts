import { Global, Module } from '@nestjs/common';
import { RbacController } from './controllers/rbac.controller';
import { RolesService } from './services/roles.service';
import { PermissionCacheService } from './services/permission-cache.service';
import { PermissionResolverService } from './services/permission-resolver.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { RolePrismaRepository } from './repositories/prisma/role.prisma-repository';
import { PermissionPrismaRepository } from './repositories/prisma/permission.prisma-repository';
import {
  PERMISSION_REPOSITORY,
  ROLE_REPOSITORY,
} from './repositories/interfaces/rbac-repository.interface';

@Global()
@Module({
  controllers: [RbacController],
  providers: [
    RolesService,
    PermissionCacheService,
    PermissionResolverService,
    PermissionsGuard,
    RolePrismaRepository,
    PermissionPrismaRepository,
    { provide: ROLE_REPOSITORY, useExisting: RolePrismaRepository },
    { provide: PERMISSION_REPOSITORY, useExisting: PermissionPrismaRepository },
  ],
  exports: [
    RolesService,
    PermissionCacheService,
    PermissionResolverService,
    PermissionsGuard,
    ROLE_REPOSITORY,
    PERMISSION_REPOSITORY,
  ],
})
export class RbacModule {}
