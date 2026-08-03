import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue, JobsOptions } from 'bullmq';
import { QUEUE_NAMES, DEAD_LETTER_SUFFIX, type QueueName } from '@infra/queue/queue.constants';
import { ValidationError } from '@common/errors';

export interface QueueStats {
  name: QueueName;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

/**
 * Administrative facade over the BullMQ queues declared in
 * `QUEUE_NAMES`. Every mutating operation is exposed to operations
 * staff via the admin controllers, guarded by RBAC + audit.
 */
@Injectable()
export class QueueOpsService {
  private readonly queues: Record<QueueName, Queue>;

  constructor(
    @InjectQueue(QUEUE_NAMES.PETPOOJA_SAVE_ORDER) petpoojaSaveOrder: Queue,
    @InjectQueue(QUEUE_NAMES.PETPOOJA_UPDATE_STATUS) petpoojaUpdateStatus: Queue,
    @InjectQueue(QUEUE_NAMES.PETPOOJA_ORDER_CANCEL) petpoojaOrderCancel: Queue,
    @InjectQueue(QUEUE_NAMES.PETPOOJA_RIDER_UPDATE) petpoojaRiderUpdate: Queue,
    @InjectQueue(QUEUE_NAMES.PETPOOJA_FETCH_MENU) petpoojaFetchMenu: Queue,
    @InjectQueue(QUEUE_NAMES.PETPOOJA_STOCK_TOGGLE) petpoojaStockToggle: Queue,
    @InjectQueue(QUEUE_NAMES.PETPOOJA_WEBHOOK_PROCESS) petpoojaWebhookProcess: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS_SEND) notificationsSend: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS_PUSH) notificationsPush: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS_RETRY) notificationsRetry: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS_CLEANUP) notificationsCleanup: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS_BROADCAST) notificationsBroadcast: Queue,
    @InjectQueue(QUEUE_NAMES.OUTBOX_PUBLISH) outboxPublish: Queue,
    @InjectQueue(QUEUE_NAMES.ANALYTICS_INGEST) analyticsIngest: Queue,
    @InjectQueue(QUEUE_NAMES.PAYMENTS_VERIFY) paymentsVerify: Queue,
    @InjectQueue(QUEUE_NAMES.PAYMENTS_WEBHOOK_PROCESS) paymentsWebhookProcess: Queue,
    @InjectQueue(QUEUE_NAMES.PAYMENTS_REFUND) paymentsRefund: Queue,
    @InjectQueue(QUEUE_NAMES.PAYMENTS_CLEANUP) paymentsCleanup: Queue,
    @InjectQueue(QUEUE_NAMES.REPORTS_GENERATE) reportsGenerate: Queue,
    @InjectQueue(QUEUE_NAMES.AUDIT_INGEST) auditIngest: Queue,
  ) {
    this.queues = {
      [QUEUE_NAMES.PETPOOJA_SAVE_ORDER]: petpoojaSaveOrder,
      [QUEUE_NAMES.PETPOOJA_UPDATE_STATUS]: petpoojaUpdateStatus,
      [QUEUE_NAMES.PETPOOJA_ORDER_CANCEL]: petpoojaOrderCancel,
      [QUEUE_NAMES.PETPOOJA_RIDER_UPDATE]: petpoojaRiderUpdate,
      [QUEUE_NAMES.PETPOOJA_FETCH_MENU]: petpoojaFetchMenu,
      [QUEUE_NAMES.PETPOOJA_STOCK_TOGGLE]: petpoojaStockToggle,
      [QUEUE_NAMES.PETPOOJA_WEBHOOK_PROCESS]: petpoojaWebhookProcess,
      [QUEUE_NAMES.NOTIFICATIONS_SEND]: notificationsSend,
      [QUEUE_NAMES.NOTIFICATIONS_PUSH]: notificationsPush,
      [QUEUE_NAMES.NOTIFICATIONS_RETRY]: notificationsRetry,
      [QUEUE_NAMES.NOTIFICATIONS_CLEANUP]: notificationsCleanup,
      [QUEUE_NAMES.NOTIFICATIONS_BROADCAST]: notificationsBroadcast,
      [QUEUE_NAMES.OUTBOX_PUBLISH]: outboxPublish,
      [QUEUE_NAMES.ANALYTICS_INGEST]: analyticsIngest,
      [QUEUE_NAMES.PAYMENTS_VERIFY]: paymentsVerify,
      [QUEUE_NAMES.PAYMENTS_WEBHOOK_PROCESS]: paymentsWebhookProcess,
      [QUEUE_NAMES.PAYMENTS_REFUND]: paymentsRefund,
      [QUEUE_NAMES.PAYMENTS_CLEANUP]: paymentsCleanup,
      [QUEUE_NAMES.REPORTS_GENERATE]: reportsGenerate,
      [QUEUE_NAMES.AUDIT_INGEST]: auditIngest,
    };
  }

  listQueues(): QueueName[] {
    return Object.keys(this.queues) as QueueName[];
  }

  private queue(name: QueueName): Queue {
    const q = this.queues[name];
    if (!q) throw new ValidationError(`Unknown queue: ${name}`);
    return q;
  }

  async statsAll(): Promise<QueueStats[]> {
    return Promise.all(this.listQueues().map((n) => this.stats(n)));
  }

  async stats(name: QueueName): Promise<QueueStats> {
    const q = this.queue(name);
    const [counts, paused] = await Promise.all([q.getJobCounts(), q.isPaused()]);
    return {
      name,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
      paused,
    };
  }

  async pause(name: QueueName): Promise<void> {
    await this.queue(name).pause();
  }

  async resume(name: QueueName): Promise<void> {
    await this.queue(name).resume();
  }

  async retryFailed(name: QueueName, jobIds?: string[]): Promise<number> {
    const q = this.queue(name);
    const jobs = jobIds
      ? await Promise.all(jobIds.map((id) => q.getJob(id)))
      : await q.getFailed(0, 100);
    let retried = 0;
    for (const job of jobs) {
      if (!job) continue;
      await job.retry();
      retried += 1;
    }
    return retried;
  }

  async cancel(name: QueueName, jobId: string): Promise<boolean> {
    const q = this.queue(name);
    const job = await q.getJob(jobId);
    if (!job) return false;
    await job.remove();
    return true;
  }

  async listFailed(name: QueueName, limit = 50) {
    const q = this.queue(name);
    const jobs = await q.getFailed(0, limit - 1);
    return jobs.map((j) => ({
      id: j.id,
      name: j.name,
      failedReason: j.failedReason,
      attemptsMade: j.attemptsMade,
      timestamp: j.timestamp,
    }));
  }

  async replayDlq(name: QueueName, opts?: JobsOptions): Promise<{ replayed: number }> {
    const q = this.queue(name);
    const dlqName = name + DEAD_LETTER_SUFFIX;
    // Best-effort: pull failed jobs and re-enqueue on the primary queue.
    const failed = await q.getFailed(0, 200);
    let replayed = 0;
    for (const job of failed) {
      await q.add(job.name, job.data, {
        ...opts,
        jobId: undefined,
      });
      await job.remove();
      replayed += 1;
    }
    return { replayed, ...(dlqName ? {} : {}) };
  }
}
