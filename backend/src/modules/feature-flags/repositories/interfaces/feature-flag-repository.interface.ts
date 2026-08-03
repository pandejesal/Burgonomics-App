import type { FeatureFlag } from '@prisma/client';
import type { UpsertFeatureFlagDto } from '../../dto';

export const FEATURE_FLAG_REPOSITORY = Symbol('FEATURE_FLAG_REPOSITORY');

export interface IFeatureFlagRepository {
  list(): Promise<FeatureFlag[]>;
  upsert(input: UpsertFeatureFlagDto): Promise<FeatureFlag>;
  delete(key: string): Promise<void>;
}
