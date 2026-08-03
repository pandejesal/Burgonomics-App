import { Module } from '@nestjs/common';
import { AnalyticsController } from './controllers/analytics.controller';
import { AnalyticsService } from './services/analytics.service';
import { AnalyticsPrismaRepository } from './repositories/prisma/analytics.prisma-repository';
import { ANALYTICS_REPOSITORY } from './repositories/interfaces/analytics-repository.interface';

@Module({
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    AnalyticsPrismaRepository,
    { provide: ANALYTICS_REPOSITORY, useExisting: AnalyticsPrismaRepository },
  ],
  exports: [AnalyticsService, ANALYTICS_REPOSITORY],
})
export class AnalyticsModule {}
