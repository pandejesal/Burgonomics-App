import { registerAs } from '@nestjs/config';

export interface ObservabilityConfig {
  otelEnabled: boolean;
  otelServiceName: string;
  otelExporterEndpoint?: string;
  metricsEnabled: boolean;
  sentryDsn?: string;
}

export default registerAs<ObservabilityConfig>('observability', () => ({
  otelEnabled: process.env.OTEL_ENABLED === 'true',
  otelServiceName: process.env.OTEL_SERVICE_NAME ?? 'burgonomics-backend',
  otelExporterEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  metricsEnabled: process.env.METRICS_ENABLED !== 'false',
  sentryDsn: process.env.SENTRY_DSN,
}));
