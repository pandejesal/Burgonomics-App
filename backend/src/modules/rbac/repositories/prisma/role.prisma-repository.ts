import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { NotFoundError, ConflictError } from '@common/errors';
import type { IRoleRepository } from '../interfaces/rbac-repository.interface';
import type {
  RoleEntity,
  RoleWithPermissions,
  UserRoleAssignmentEntity,
} from '../../entities/role.entity';
import type { CreateRoleDto, UpdateRoleDto } from '../../dto';

@Injectable()
export class RolePrismaRepository implements IRoleRepository {
  constructor(private readonly prisma: PrismaService) {}

  private materialize(row: {
    id: string;
    key: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    createdAt: Date;
    updatedAt: Date;
    permissions: Array<{ permission: { key: string } }>;
  }): RoleWithPermissions {
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      isSystem: row.isSystem,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      permissions: row.permissions.map((rp) => rp.permission.key),
    };
  }

  async list(): Promise<RoleWithPermissions[]> {
    const rows = await this.prisma.role.findMany({
      orderBy: { key: 'asc' },
      include: { permissions: { include: { permission: true } } },
    });
    return rows.map((r) => this.materialize(r));
  }

  async findByKey(key: string): Promise<RoleWithPermissions | null> {
    const row = await this.prisma.role.findUnique({
      where: { key },
      include: { permissions: { include: { permission: true } } },
    });
    return row ? this.materialize(row) : null;
  }

  async findById(id: string): Promise<RoleWithPermissions | null> {
    const row = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } },
    });
    return row ? this.materialize(row) : null;
  }

  async create(input: CreateRoleDto & { isSystem?: boolean }): Promise<RoleWithPermissions> {
    const existing = await this.prisma.role.findUnique({ where: { key: input.key } });
    if (existing) throw new ConflictError(`Role already exists: ${input.key}`);

    const created = await this.prisma.role.create({
      data: {
        key: input.key,
        name: input.name,
        description: input.description,
        isSystem: input.isSystem ?? false,
      },
    });
    await this.setPermissions(created.id, input.permissions ?? []);
    const withPerms = await this.findById(created.id);
    if (!withPerms) throw new NotFoundError('Role');
    return withPerms;
  }

  async update(id: string, patch: UpdateRoleDto): Promise<RoleWithPermissions> {
    await this.prisma.role.update({
      where: { id },
      data: { name: patch.name, description: patch.description },
    });
    if (patch.permissions) await this.setPermissions(id, patch.permissions);
    const withPerms = await this.findById(id);
    if (!withPerms) throw new NotFoundError('Role');
    return withPerms;
  }

  async delete(id: string): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) return;
    if (role.isSystem) throw new ConflictError('System roles cannot be deleted');
    await this.prisma.role.delete({ where: { id } });
  }

  async setPermissions(roleId: string, permissionKeys: string[]): Promise<void> {
    const unique = Array.from(new Set(permissionKeys));
    const perms = unique.length
      ? await this.prisma.permission.findMany({ where: { key: { in: unique } } })
      : [];
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      ...(perms.length
        ? [
            this.prisma.rolePermission.createMany({
              data: perms.map((p) => ({ roleId, permissionId: p.id })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
  }

  async assignToUser(input: {
    userId: string;
    roleKey: string;
    scope?: string;
    assignedBy?: string;
  }): Promise<UserRoleAssignmentEntity> {
    const role = await this.prisma.role.findUnique({ where: { key: input.roleKey } });
    if (!role) throw new NotFoundError(`Role: ${input.roleKey}`);

    const row = await this.prisma.userRoleAssignment.upsert({
      where: {
        userId_roleId_scope: {
          userId: input.userId,
          roleId: role.id,
          scope: input.scope ?? '',
        },
      },
      create: {
        userId: input.userId,
        roleId: role.id,
        scope: input.scope ?? '',
        assignedBy: input.assignedBy,
      },
      update: {},
    });
    return row;
  }

  async removeFromUser(userId: string, roleKey: string, scope?: string): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { key: roleKey } });
    if (!role) return;
    await this.prisma.userRoleAssignment.deleteMany({
      where: { userId, roleId: role.id, scope: scope ?? '' },
    });
  }

  async listAssignmentsForUser(
    userId: string,
  ): Promise<Array<UserRoleAssignmentEntity & { role: RoleEntity }>> {
    const rows = await this.prisma.userRoleAssignment.findMany({
      where: { userId },
      include: { role: true },
    });
    return rows.map((r) => ({ ...r, role: r.role }));
  }

  async listPermissionKeysForUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.userRoleAssignment.findMany({
      where: { userId },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });
    const keys = new Set<string>();
    for (const r of rows) {
      for (const rp of r.role.permissions) keys.add(rp.permission.key);
    }
    return Array.from(keys);
  }
}
