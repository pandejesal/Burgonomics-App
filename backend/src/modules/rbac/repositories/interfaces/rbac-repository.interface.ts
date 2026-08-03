import type { PermissionEntity } from '../../entities/permission.entity';
import type {
  RoleEntity,
  RoleWithPermissions,
  UserRoleAssignmentEntity,
} from '../../entities/role.entity';
import type { CreateRoleDto, UpdateRoleDto, UpsertPermissionDto } from '../../dto';

export const PERMISSION_REPOSITORY = Symbol('PERMISSION_REPOSITORY');

export interface IPermissionRepository {
  list(): Promise<PermissionEntity[]>;
  findByKey(key: string): Promise<PermissionEntity | null>;
  upsert(input: UpsertPermissionDto): Promise<PermissionEntity>;
  ensureMany(keys: string[]): Promise<PermissionEntity[]>;
  delete(key: string): Promise<void>;
}

export const ROLE_REPOSITORY = Symbol('ROLE_REPOSITORY');

export interface IRoleRepository {
  list(): Promise<RoleWithPermissions[]>;
  findByKey(key: string): Promise<RoleWithPermissions | null>;
  findById(id: string): Promise<RoleWithPermissions | null>;
  create(input: CreateRoleDto & { isSystem?: boolean }): Promise<RoleWithPermissions>;
  update(id: string, patch: UpdateRoleDto): Promise<RoleWithPermissions>;
  delete(id: string): Promise<void>;
  setPermissions(roleId: string, permissionKeys: string[]): Promise<void>;
  assignToUser(input: {
    userId: string;
    roleKey: string;
    scope?: string;
    assignedBy?: string;
  }): Promise<UserRoleAssignmentEntity>;
  removeFromUser(userId: string, roleKey: string, scope?: string): Promise<void>;
  listAssignmentsForUser(
    userId: string,
  ): Promise<Array<UserRoleAssignmentEntity & { role: RoleEntity }>>;
  listPermissionKeysForUser(userId: string): Promise<string[]>;
}
