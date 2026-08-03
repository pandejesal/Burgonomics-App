import { registerAs } from '@nestjs/config';

export interface CacheConfig {
  defaultTtlSeconds: number;
  menuTtlSeconds: number;
}

export default registerAs<CacheConfig>('cache', () => ({
  defaultTtlSeconds: Number(process.env.CACHE_DEFAULT_TTL_SECONDS ?? 60),
  menuTtlSeconds: Number(process.env.CACHE_MENU_TTL_SECONDS ?? 300),
}));
