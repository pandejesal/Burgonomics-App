import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { NotFoundError } from '@common/errors';
import type {
  SystemConfigEntity,
  SystemConfigVersionEntity,
} from '../../entities/system-config.entity';
import type { SetConfigDto } from '../../dto';
import type { ISystemConfigRepository } from '../interfaces/system-config-repository.interface';

@Injectable()
export class SystemConfigPrismaRepository implements ISystemConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(category?: string): Promise<SystemConfigEntity[]> {
    const rows = await this.prisma.systemConfig.findMany({
      where: category ? { category } : undefined,
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });
    return rows;
  }

  getByKey(key: string): Promise<SystemConfigEntity | null> {
    return this.prisma.systemConfig.findUnique({ where: { key } });
  }

  async set(input: SetConfigDto & { updatedBy?: string }): Promise<SystemConfigEntity> {
    const value = (input.value as Prisma.InputJsonValue) ?? Prisma.JsonNull;
    const existing = await this.prisma.systemConfig.findUnique({ where: { key: input.key } });

    if (!existing) {
      const created = await this.prisma.systemConfig.create({
        data: {
          key: input.key,
          value,
          category: input.category,
          description: input.description,
          updatedBy: input.updatedBy,
          version: 1,
        },
      });
      await this.prisma.systemConfigVersion.create({
        data: {
          configId: created.id,
          version: 1,
          value,
          changedBy: input.updatedBy,
          changeNote: input.changeNote,
        },
      });
      return created;
    }

    const nextVersion = existing.version + 1;
    const [updated] = await this.prisma.$transaction([
      this.prisma.systemConfig.update({
        where: { id: existing.id },
        data: {
          value,
          category: input.category,
          description: input.description,
          updatedBy: input.updatedBy,
          version: nextVersion,
        },
      }),
      this.prisma.systemConfigVersion.create({
        data: {
          configId: existing.id,
          version: nextVersion,
          value,
          changedBy: input.updatedBy,
          changeNote: input.changeNote,
        },
      }),
    ]);
    return updated;
  }

  async delete(key: string): Promise<void> {
    const existing = await this.prisma.systemConfig.findUnique({ where: { key } });
    if (!existing) return;
    await this.prisma.systemConfig.delete({ where: { id: existing.id } });
  }

  async history(key: string, limit: number): Promise<SystemConfigVersionEntity[]> {
    const config = await this.prisma.systemConfig.findUnique({ where: { key } });
    if (!config) throw new NotFoundError(`SystemConfig: ${key}`);
    const rows = await this.prisma.systemConfigVersion.findMany({
      where: { configId: config.id },
      orderBy: { version: 'desc' },
      take: limit,
    });
    return rows;
  }
}
