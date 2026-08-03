import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import type { IPermissionRepository } from '../interfaces/rbac-repository.interface';
import type { PermissionEntity } from '../../entities/permission.entity';
import type { UpsertPermissionDto } from '../../dto';

@Injectable()
export class PermissionPrismaRepository implements IPermissionRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<PermissionEntity[]> {
    return this.prisma.permission.findMany({ orderBy: { key: 'asc' } });
  }

  findByKey(key: string): Promise<PermissionEntity | null> {
    return this.prisma.permission.findUnique({ where: { key } });
  }

  upsert(input: UpsertPermissionDto): Promise<PermissionEntity> {
    return this.prisma.permission.upsert({
      where: { key: input.key },
      create: {
        key: input.key,
        resource: input.resource,
        action: input.action,
        description: input.description,
      },
      update: {
        resource: input.resource,
        action: input.action,
        description: input.description,
      },
    });
  }

  async ensureMany(keys: string[]): Promise<PermissionEntity[]> {
    const unique = Array.from(new Set(keys));
    if (unique.length === 0) return [];
    await this.prisma.$transaction(
      unique.map((key) => {
        const [resource, ...rest] = key.split('.');
        const action = rest.join('.') || 'read';
        return this.prisma.permission.upsert({
          where: { key },
          create: { key, resource: resource ?? 'general', action },
          update: {},
        });
      }),
    );
    return this.prisma.permission.findMany({ where: { key: { in: unique } } });
  }

  async delete(key: string): Promise<void> {
    await this.prisma.permission.deleteMany({ where: { key } });
  }
}
