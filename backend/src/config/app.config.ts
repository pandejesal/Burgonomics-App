import { registerAs } from '@nestjs/config';

export interface AppConfig {
  env: 'development' | 'test' | 'staging' | 'production';
  name: string;
  port: number;
  globalPrefix: string;
  corsOrigins: string[] | boolean;
  logLevel: string;
}

export default registerAs<AppConfig>('app', () => ({
  env: (process.env.NODE_ENV as AppConfig['env']) ?? 'development',
  name: process.env.APP_NAME ?? 'burgonomics-backend',
  port: Number(process.env.APP_PORT ?? 3000),
  globalPrefix: process.env.APP_GLOBAL_PREFIX ?? 'api',
  corsOrigins: parseOrigins(process.env.APP_CORS_ORIGINS),
  logLevel: process.env.LOG_LEVEL ?? 'info',
}));

function parseOrigins(raw?: string): string[] | boolean {
  if (!raw || raw.trim() === '' || raw === '*') return true;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
