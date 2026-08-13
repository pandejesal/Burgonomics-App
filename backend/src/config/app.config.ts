import { registerAs } from '@nestjs/config';

export interface AppConfig {
  env: 'development' | 'test' | 'staging' | 'production';
  name: string;
  port: number;
  globalPrefix: string;
  corsOrigins: string[];
  logLevel: string;
}

const DEFAULT_ORIGINS = [
  'https://burgonomics.com',
  'https://www.burgonomics.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
];

export default registerAs<AppConfig>('app', () => {
  const env = ((process.env.NODE_ENV as AppConfig['env']) ?? 'development');
  return {
    env,
    name: process.env.APP_NAME ?? 'burgonomics-backend',
    port: Number(process.env.APP_PORT ?? 3000),
    globalPrefix: process.env.APP_GLOBAL_PREFIX ?? 'api',
    corsOrigins: parseOrigins(process.env.APP_CORS_ORIGINS, env),
    logLevel: process.env.LOG_LEVEL ?? 'info',
  };
});

function parseOrigins(raw?: string, env?: string): string[] {
  if (!raw || raw.trim() === '' || raw === '*') {
    if (env === 'production') {
      return ['https://burgonomics.com', 'https://www.burgonomics.com'];
    }
    return DEFAULT_ORIGINS;
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
