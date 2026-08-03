import { Module } from '@nestjs/common';
import { FeatureFlagsController } from './controllers/feature-flags.controller';
import { FeatureFlagsAdminService } from './services/feature-flags-admin.service';
import { FeatureFlagPrismaRepository } from './repositories/prisma/feature-flag.prisma-repository';
import { FEATURE_FLAG_REPOSITORY } from './repositories/interfaces/feature-flag-repository.interface';

@Module({
  controllers: [FeatureFlagsController],
  providers: [
    FeatureFlagsAdminService,
    FeatureFlagPrismaRepository,
    { provide: FEATURE_FLAG_REPOSITORY, useExisting: FeatureFlagPrismaRepository },
  ],
  exports: [FeatureFlagsAdminService, FEATURE_FLAG_REPOSITORY],
})
export class FeatureFlagsModule {}
