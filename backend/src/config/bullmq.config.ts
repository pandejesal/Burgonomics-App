import { registerAs } from '@nestjs/config';

export interface BullMqConfig {
  prefix: string;
  defaultAttempts: number;
  defaultBackoffMs: number;
}

export default registerAs<BullMqConfig>('bullmq', () => ({
  prefix: process.env.BULLMQ_PREFIX ?? 'burgonomics',
  defaultAttempts: Number(process.env.BULLMQ_DEFAULT_ATTEMPTS ?? 5),
  defaultBackoffMs: Number(process.env.BULLMQ_DEFAULT_BACKOFF_MS ?? 2000),
}));
