import { Module } from '@nestjs/common';
import { LoggerModule } from './logger/logger.module';
import { MetricsModule } from './metrics/metrics.module';
import { TracingModule } from './tracing/tracing.module';
import { SentryModule } from './sentry/sentry.module';

@Module({
  imports: [LoggerModule, MetricsModule, TracingModule, SentryModule],
  exports: [LoggerModule, MetricsModule, TracingModule, SentryModule],
})
export class ObservabilityModule {}
