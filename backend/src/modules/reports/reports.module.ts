import { Module } from '@nestjs/common';
import { AnalyticsModule } from '@modules/analytics';
import { ReportsController } from './controllers/reports.controller';
import { ReportsService } from './services/reports.service';
import { ReportExporterService } from './services/report-exporter.service';
import { ReportGeneratorRegistry } from './services/report-generator.registry';
import { ReportConsumer } from './consumers/report.consumer';
import { ReportPrismaRepository } from './repositories/prisma/report.prisma-repository';
import { REPORT_REPOSITORY } from './repositories/interfaces/report-repository.interface';

@Module({
  imports: [AnalyticsModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportExporterService,
    ReportGeneratorRegistry,
    ReportConsumer,
    ReportPrismaRepository,
    { provide: REPORT_REPOSITORY, useExisting: ReportPrismaRepository },
  ],
  exports: [ReportsService, REPORT_REPOSITORY],
})
export class ReportsModule {}
