import { z } from 'zod';

/**
 * Single source of truth for runtime environment. Boot fails hard if
 * a required variable is missing or malformed — no silent defaults.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),

  APP_NAME: z.string().default('burgonomics-backend'),
  APP_PORT: z.coerce.number().int().positive().default(3000),
  APP_GLOBAL_PREFIX: z.string().default('api'),
  APP_CORS_ORIGINS: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url(),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().nonnegative().default(0),
  REDIS_TLS: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  CACHE_DEFAULT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  CACHE_MENU_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  BULLMQ_PREFIX: z.string().default('burgonomics'),
  BULLMQ_DEFAULT_ATTEMPTS: z.coerce.number().int().positive().default(5),
  BULLMQ_DEFAULT_BACKOFF_MS: z.coerce.number().int().positive().default(2000),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),

  // Admin tokens: REQUIRED (no defaults — a hardcoded fallback would let
  // anyone forge admin JWTs). Boot fails hard when missing.
  ADMIN_JWT_ACCESS_SECRET: z.string().min(32),
  ADMIN_JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  JWT_ISSUER: z.string().default('burgonomics'),
  JWT_AUDIENCE: z.string().default('burgonomics-mobile'),

  RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),

  WEBHOOK_REPLAY_WINDOW_SECONDS: z.coerce.number().int().positive().default(300),

  PETPOOJA_BASE_URL: z.string().url().default('https://api.petpooja.com'),
  PETPOOJA_APP_KEY: z.string().optional(),
  PETPOOJA_APP_SECRET: z.string().optional(),
  PETPOOJA_ACCESS_TOKEN: z.string().optional(),
  PETPOOJA_WEBHOOK_SECRET: z.string().optional(),
  PETPOOJA_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),

  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_BASE_URL: z.string().url().default('https://api.razorpay.com/v1'),
  RAZORPAY_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  RAZORPAY_REPLAY_WINDOW_SECONDS: z.coerce.number().int().positive().default(300),
  RAZORPAY_ORDER_EXPIRY_MINUTES: z.coerce.number().int().positive().default(15),

  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),

  STORAGE_DRIVER: z.enum(['noop', 's3', 'r2', 'minio', 'azure', 'gcs']).default('noop'),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_REGION: z.string().optional(),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_PUBLIC_BASE_URL: z.string().optional(),

  FEATURE_FLAGS_DRIVER: z.enum(['env', 'database']).default('env'),
  FEATURE_OFFERS: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  FEATURE_DELIVERY: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  FEATURE_TAKEAWAY: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  FEATURE_DINE_IN: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  FEATURE_NEW_CHECKOUT: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  FEATURE_FESTIVAL_CAMPAIGNS: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  FEATURE_BETA: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  OTEL_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  OTEL_SERVICE_NAME: z.string().default('burgonomics-backend'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  METRICS_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  SENTRY_DSN: z.string().optional(),

  SWAGGER_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  SWAGGER_PATH: z.string().default('docs'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
