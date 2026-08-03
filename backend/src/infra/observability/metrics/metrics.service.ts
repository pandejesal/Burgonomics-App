import { Injectable, OnModuleInit } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  readonly httpRequests: Counter<string> = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status'],
    registers: [this.registry],
  });

  readonly httpDuration: Histogram<string> = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
    registers: [this.registry],
  });

  readonly petpoojaCalls: Counter<string> = new Counter({
    name: 'petpooja_calls_total',
    help: 'PETPOOJA outbound calls',
    labelNames: ['endpoint', 'status'],
    registers: [this.registry],
  });

  readonly petpoojaLatency: Histogram<string> = new Histogram({
    name: 'petpooja_call_duration_seconds',
    help: 'PETPOOJA outbound latency',
    labelNames: ['endpoint'],
    buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10, 30],
    registers: [this.registry],
  });

  readonly razorpayCalls: Counter<string> = new Counter({
    name: 'razorpay_calls_total',
    help: 'Razorpay outbound calls',
    labelNames: ['endpoint', 'status'],
    registers: [this.registry],
  });

  readonly razorpayLatency: Histogram<string> = new Histogram({
    name: 'razorpay_call_duration_seconds',
    help: 'Razorpay outbound latency',
    labelNames: ['endpoint'],
    buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10, 30],
    registers: [this.registry],
  });

  readonly paymentEvents: Counter<string> = new Counter({
    name: 'payment_events_total',
    help: 'Payment lifecycle events',
    labelNames: ['event', 'status'],
    registers: [this.registry],
  });

  readonly refundEvents: Counter<string> = new Counter({
    name: 'refund_events_total',
    help: 'Refund lifecycle events',
    labelNames: ['event', 'status'],
    registers: [this.registry],
  });

  readonly paymentWebhookEvents: Counter<string> = new Counter({
    name: 'payment_webhook_events_total',
    help: 'Payment webhook processing outcomes',
    labelNames: ['event', 'outcome'],
    registers: [this.registry],
  });

  readonly notificationEvents: Counter<string> = new Counter({
    name: 'notification_events_total',
    help: 'Notification lifecycle events (created, sent, failed, read, archived)',
    labelNames: ['event', 'type', 'channel'],
    registers: [this.registry],
  });

  readonly notificationLatency: Histogram<string> = new Histogram({
    name: 'notification_delivery_duration_seconds',
    help: 'Notification end-to-end delivery latency (queue accept -> channel ack)',
    labelNames: ['channel', 'type'],
    buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10, 30],
    registers: [this.registry],
  });

  readonly fcmCalls: Counter<string> = new Counter({
    name: 'firebase_messaging_calls_total',
    help: 'Firebase Cloud Messaging outbound calls',
    labelNames: ['operation', 'status'],
    registers: [this.registry],
  });

  readonly fcmLatency: Histogram<string> = new Histogram({
    name: 'firebase_messaging_call_duration_seconds',
    help: 'Firebase Cloud Messaging latency',
    labelNames: ['operation'],
    buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
    registers: [this.registry],
  });

  readonly sseConnections: Counter<string> = new Counter({
    name: 'sse_connections_total',
    help: 'SSE connection lifecycle events',
    labelNames: ['event'],
    registers: [this.registry],
  });

  readonly sseActiveConnections: Gauge<string> = new Gauge({
    name: 'sse_active_connections',
    help: 'Currently open SSE connections on this instance',
    labelNames: ['stream'],
    registers: [this.registry],
  });

  readonly sseMessages: Counter<string> = new Counter({
    name: 'sse_messages_total',
    help: 'SSE messages delivered',
    labelNames: ['stream', 'event'],
    registers: [this.registry],
  });

  // Redis Metrics
  readonly redisOperations: Counter<string> = new Counter({
    name: 'redis_operations_total',
    help: 'Total Redis operations',
    labelNames: ['command', 'status'],
    registers: [this.registry],
  });

  readonly redisLatency: Histogram<string> = new Histogram({
    name: 'redis_operation_duration_seconds',
    help: 'Redis operation duration in seconds',
    labelNames: ['command'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
    registers: [this.registry],
  });

  // BullMQ Metrics
  readonly bullmqJobs: Counter<string> = new Counter({
    name: 'bullmq_jobs_total',
    help: 'Total BullMQ jobs processed',
    labelNames: ['queue', 'job_name', 'status'],
    registers: [this.registry],
  });

  readonly bullmqActiveWorkers: Gauge<string> = new Gauge({
    name: 'bullmq_active_workers',
    help: 'Number of active BullMQ workers',
    labelNames: ['queue'],
    registers: [this.registry],
  });

  // OTP Metrics
  readonly otpRequests: Counter<string> = new Counter({
    name: 'otp_requests_total',
    help: 'Total OTP request attempts',
    labelNames: ['provider', 'channel', 'purpose'],
    registers: [this.registry],
  });

  readonly otpVerifications: Counter<string> = new Counter({
    name: 'otp_verifications_total',
    help: 'Total OTP verification outcomes',
    labelNames: ['status'],
    registers: [this.registry],
  });

  // Admin Metrics
  readonly adminLogins: Counter<string> = new Counter({
    name: 'admin_logins_total',
    help: 'Total administrative login attempts',
    labelNames: ['status'],
    registers: [this.registry],
  });

  readonly adminSessions: Gauge<string> = new Gauge({
    name: 'admin_active_sessions',
    help: 'Currently active administrative sessions',
    registers: [this.registry],
  });

  readonly adminAuditLogs: Counter<string> = new Counter({
    name: 'admin_audit_logs_total',
    help: 'Total administrative audit logs generated',
    labelNames: ['action', 'resource'],
    registers: [this.registry],
  });

  // Database Metrics
  readonly dbQueries: Counter<string> = new Counter({
    name: 'database_queries_total',
    help: 'Total database queries executed via Prisma',
    labelNames: ['model', 'operation', 'status'],
    registers: [this.registry],
  });

  readonly dbLatency: Histogram<string> = new Histogram({
    name: 'database_query_duration_seconds',
    help: 'Database query execution latency',
    labelNames: ['model', 'operation'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registers: [this.registry],
  });

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }
}
