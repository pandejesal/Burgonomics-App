import { registerAs } from '@nestjs/config';

export interface SwaggerConfig {
  enabled: boolean;
  path: string;
}

export default registerAs<SwaggerConfig>('swagger', () => ({
  enabled: process.env.SWAGGER_ENABLED !== 'false',
  path: process.env.SWAGGER_PATH ?? 'docs',
}));
