import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import {
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  ROLES,
  type PermissionKey,
  type RoleKey,
} from '../constants';
import {
  PERMISSION_REPOSITORY,
  ROLE_REPOSITORY,
  type IPermissionRepository,
  type IRoleRepository,
} from '../repositories/interfaces/rbac-repository.interface';
import type { CreateRoleDto, UpdateRoleDto, UpsertPermissionDto } from '../dto';
import type { RoleWithPermissions } from '../entities/role.entity';
import type { PermissionEntity } from '../entities/permission.entity';
import { PermissionCacheService } from './permission-cache.service';
import { ConflictError, NotFoundError, ForbiddenError } from '@common/errors';

/**
 * Roles + permissions orchestration service.
 *
 * On boot, seeds the canonical role catalog and permission set so the
 * platform always ships with a coherent baseline RBAC configuration.
 * Custom (non-system) roles and permissions are user-manageable.
 */
@Injectable()
export class RolesService implements OnModuleInit {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: IRoleRepository,
    @Inject(PERMISSION_REPOSITORY) private readonly permissions: IPermissionRepository,
    private readonly cache: PermissionCacheService,
    private readonly logger: Logger,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seedSystemCatalog();
    } catch (err) {
      // Do not crash the app if DB isn't ready; log for ops visibility.
      this.logger.warn({ err: (err as Error).message }, 'RBAC system-catalog seed skipped');
    }
  }

  async seedSystemCatalog(): Promise<void> {
    await this.permissions.ensureMany(Object.values(PERMISSIONS));

    for (const roleKey of Object.values(ROLES) as RoleKey[]) {
      const desired = ROLE_DEFAULT_PERMISSIONS[roleKey];
      const existing = await this.roles.findByKey(roleKey);
      if (!existing) {
        await this.roles.create({
          key: roleKey,
          name: this.formatName(roleKey),
          description: `System role: ${roleKey}`,
          permissions: desired as unknown as PermissionKey[],
          isSystem: true,
        });
      } else {
        await this.roles.setPermissions(existing.id, desired as unknown as string[]);
      }
    }
  }

  private formatName(key: string): string {
    return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  listRoles(): Promise<RoleWithPermissions[]> {
    return this.roles.list();
  }

  async getRole(id: string): Promise<RoleWithPermissions> {
    const r = await this.roles.findById(id);
    if (!r) throw new NotFoundError('Role');
    return r;
  }

  createRole(input: CreateRoleDto): Promise<RoleWithPermissions> {
    return this.roles.create({ ...input, isSystem: false });
  }

  async updateRole(id: string, patch: UpdateRoleDto): Promise<RoleWithPermissions> {
    const existing = await this.roles.findById(id);
    if (!existing) throw new NotFoundError('Role');
    if (existing.isSystem && patch.permissions) {
      throw new ConflictError('System role permissions are managed by the seeder');
    }
    const updated = await this.roles.update(id, patch);
    await this.cache.invalidateAll();
    return updated;
  }

  async deleteRole(id: string): Promise<void> {
    await this.roles.delete(id);
    await this.cache.invalidateAll();
  }

  async assignToUser(input: {
    userId: string;
    roleKey: string;
    scope?: string;
    assignedBy?: string;
  }) {
    if (input.assignedBy) {
      const assignerAssignments = await this.roles.listAssignmentsForUser(input.assignedBy);
      const assignerRoles = assignerAssignments.map((a) => a.role.key);
      const isSuperAdmin = assignerRoles.includes('super_admin');

      // 1. Prevent non-super_admins from assigning the 'super_admin' role
      if (input.roleKey === 'super_admin' && !isSuperAdmin) {
        throw new ForbiddenError(
          'Privilege Escalation Prevention: Only super_admin can assign the super_admin role.',
        );
      }

      // 2. Prevent non-super_admins from assigning 'admin' unless they themselves are an admin
      if (input.roleKey === 'admin' && !isSuperAdmin && !assignerRoles.includes('admin')) {
        throw new ForbiddenError(
          'Privilege Escalation Prevention: You cannot assign a role with higher privileges than your own.',
        );
      }
    }
    const res = await this.roles.assignToUser(input);
    await this.cache.invalidateUser(input.userId);
    return res;
  }

  async removeFromUser(userId: string, roleKey: string, scope?: string): Promise<void> {
    await this.roles.removeFromUser(userId, roleKey, scope);
    await this.cache.invalidateUser(userId);
  }

  listAssignmentsForUser(userId: string) {
    return this.roles.listAssignmentsForUser(userId);
  }

  listPermissions(): Promise<PermissionEntity[]> {
    return this.permissions.list();
  }

  upsertPermission(input: UpsertPermissionDto): Promise<PermissionEntity> {
    return this.permissions.upsert(input);
  }

  async deletePermission(key: string): Promise<void> {
    await this.permissions.delete(key);
  }
}
