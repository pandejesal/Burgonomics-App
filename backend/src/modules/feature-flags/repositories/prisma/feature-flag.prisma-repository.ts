import { Injectable } from '@nestjs/common';
import type { FeatureFlag } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import type { UpsertFeatureFlagDto } from '../../dto';
import type { IFeatureFlagRepository } from '../interfaces/feature-flag-repository.interface';

@Injectable()
export class FeatureFlagPrismaRepository implements IFeatureFlagRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<FeatureFlag[]> {
    return this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  }

  upsert(input: UpsertFeatureFlagDto): Promise<FeatureFlag> {
    return this.prisma.featureFlag.upsert({
      where: { key: input.key },
      create: input,
      update: { enabled: input.enabled, description: input.description },
    });
  }

  async delete(key: string): Promise<void> {
    await this.prisma.featureFlag.deleteMany({ where: { key } });
  }
}
