import { registerAs } from '@nestjs/config';

export interface SecurityConfig {
  webhookReplayWindowSeconds: number;
}

export default registerAs<SecurityConfig>('security', () => ({
  webhookReplayWindowSeconds: Number(process.env.WEBHOOK_REPLAY_WINDOW_SECONDS ?? 300),
}));
