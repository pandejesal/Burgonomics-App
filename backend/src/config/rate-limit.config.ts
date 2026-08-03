import { registerAs } from '@nestjs/config';

export interface RateLimitConfig {
  ttlSeconds: number;
  max: number;
}

export default registerAs<RateLimitConfig>('rateLimit', () => ({
  ttlSeconds: Number(process.env.RATE_LIMIT_TTL_SECONDS ?? 60),
  max: Number(process.env.RATE_LIMIT_MAX ?? 120),
}));
