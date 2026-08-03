import { SetMetadata } from '@nestjs/common';

export const FEATURE_FLAG_KEY = 'featureFlag';
export const FeatureFlag = (flag: string) => SetMetadata(FEATURE_FLAG_KEY, flag);
