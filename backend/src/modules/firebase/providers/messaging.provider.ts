import { Injectable, Logger } from '@nestjs/common';
import type { messaging } from 'firebase-admin';
import { MetricsService } from '@infra/observability/metrics/metrics.service';
import { FirebaseAppProvider } from './firebase-app.provider';
import {
  FCM_MAX_RETRIES,
  FCM_MAX_TOKENS_PER_MULTICAST,
  FCM_RETRY_BASE_DELAY_MS,
} from '../constants';

export interface FcmSingleMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
  clickAction?: string;
  priority?: 'normal' | 'high';
}

export interface FcmMulticastMessage extends Omit<FcmSingleMessage, 'token'> {
  tokens: string[];
}

export interface FcmSendResult {
  messageId: string;
}

export interface FcmMulticastResult {
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
  responses: Array<{ token: string; success: boolean; error?: string }>;
}

/**
 * Low-level Firebase Cloud Messaging wrapper. Handles retries,
 * exponential backoff, invalid-token detection, and Prometheus
 * instrumentation. This is the ONLY place in the codebase that talks
 * to `admin.messaging()`.
 */
@Injectable()
export class MessagingProvider {
  private readonly logger = new Logger(MessagingProvider.name);

  constructor(
    private readonly appProvider: FirebaseAppProvider,
    private readonly metrics: MetricsService,
  ) {}

  get available(): boolean {
    return this.appProvider.isConfigured;
  }

  async send(message: FcmSingleMessage): Promise<FcmSendResult> {
    this.ensureAvailable();
    const started = process.hrtime.bigint();
    try {
      const messageId = await this.retry(() => this.messaging().send(this.toAdminMessage(message)));
      this.recordMetric('send', 'success', started);
      return { messageId };
    } catch (err) {
      this.recordMetric('send', 'failure', started);
      throw err;
    }
  }

  async sendMulticast(message: FcmMulticastMessage): Promise<FcmMulticastResult> {
    this.ensureAvailable();
    const started = process.hrtime.bigint();
    const chunks = this.chunk(message.tokens, FCM_MAX_TOKENS_PER_MULTICAST);
    const responses: FcmMulticastResult['responses'] = [];
    const invalid: string[] = [];
    let ok = 0;
    let fail = 0;

    for (const tokens of chunks) {
      const res = await this.retry(() =>
        this.messaging().sendEachForMulticast({
          tokens,
          notification: { title: message.title, body: message.body, imageUrl: message.imageUrl },
          data: message.data,
          android: { priority: message.priority ?? 'high' },
          apns: { headers: { 'apns-priority': message.priority === 'high' ? '10' : '5' } },
        }),
      );
      res.responses.forEach((r, i) => {
        const token = tokens[i];
        if (r.success) {
          ok += 1;
          responses.push({ token, success: true });
        } else {
          fail += 1;
          const code = r.error?.code ?? 'unknown';
          responses.push({ token, success: false, error: code });
          if (this.isInvalidTokenError(code)) invalid.push(token);
        }
      });
    }
    this.recordMetric('multicast', fail > 0 ? 'partial' : 'success', started);
    return { successCount: ok, failureCount: fail, invalidTokens: invalid, responses };
  }

  async subscribeToTopic(tokens: string[], topic: string): Promise<void> {
    this.ensureAvailable();
    await this.retry(() => this.messaging().subscribeToTopic(tokens, topic));
  }

  async unsubscribeFromTopic(tokens: string[], topic: string): Promise<void> {
    this.ensureAvailable();
    await this.retry(() => this.messaging().unsubscribeFromTopic(tokens, topic));
  }

  async sendToTopic(
    topic: string,
    payload: Omit<FcmSingleMessage, 'token'>,
  ): Promise<FcmSendResult> {
    this.ensureAvailable();
    const started = process.hrtime.bigint();
    try {
      const messageId = await this.retry(() =>
        this.messaging().send({
          topic,
          notification: { title: payload.title, body: payload.body, imageUrl: payload.imageUrl },
          data: payload.data,
        }),
      );
      this.recordMetric('topic-send', 'success', started);
      return { messageId };
    } catch (err) {
      this.recordMetric('topic-send', 'failure', started);
      throw err;
    }
  }

  // ─── internals ─────────────────────────────────────────────
  private messaging(): messaging.Messaging {
    return this.appProvider.app.messaging();
  }

  private ensureAvailable(): void {
    if (!this.available) {
      throw new Error('Firebase Messaging is not configured');
    }
  }

  private toAdminMessage(m: FcmSingleMessage): messaging.Message {
    return {
      token: m.token,
      notification: { title: m.title, body: m.body, imageUrl: m.imageUrl },
      data: m.data,
      android: { priority: m.priority ?? 'high' },
      apns: { headers: { 'apns-priority': m.priority === 'high' ? '10' : '5' } },
    };
  }

  private isInvalidTokenError(code: string): boolean {
    return (
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-argument'
    );
  }

  private async retry<T>(op: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < FCM_MAX_RETRIES; attempt += 1) {
      try {
        return await op();
      } catch (err) {
        lastErr = err;
        const code = (err as { code?: string })?.code ?? '';
        if (code && this.isInvalidTokenError(code)) throw err;
        const delay = FCM_RETRY_BASE_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * 250);
        this.logger.warn(
          `FCM attempt ${attempt + 1} failed (${code || (err as Error).message}); retrying in ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastErr as Error;
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  private recordMetric(operation: string, status: string, started: bigint): void {
    const elapsed = Number(process.hrtime.bigint() - started) / 1e9;
    this.metrics.fcmCalls.inc({ operation, status });
    this.metrics.fcmLatency.observe({ operation }, elapsed);
  }
}
