import type { FeatureFlag } from '@prisma/client';
import { FeatureFlagDto } from '../dto';

export class FeatureFlagMapper {
  static toResponse(row: FeatureFlag): FeatureFlagDto {
    return {
      key: row.key,
      enabled: row.enabled,
      description: row.description ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
