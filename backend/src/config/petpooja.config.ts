import { registerAs } from '@nestjs/config';

export interface PetpoojaConfig {
  baseUrl: string;
  appKey?: string;
  appSecret?: string;
  accessToken?: string;
  webhookSecret?: string;
  httpTimeoutMs: number;
}

export default registerAs<PetpoojaConfig>('petpooja', () => ({
  baseUrl: process.env.PETPOOJA_BASE_URL ?? 'https://api.petpooja.com',
  appKey: process.env.PETPOOJA_APP_KEY,
  appSecret: process.env.PETPOOJA_APP_SECRET,
  accessToken: process.env.PETPOOJA_ACCESS_TOKEN,
  webhookSecret: process.env.PETPOOJA_WEBHOOK_SECRET,
  httpTimeoutMs: Number(process.env.PETPOOJA_HTTP_TIMEOUT_MS ?? 15000),
}));
