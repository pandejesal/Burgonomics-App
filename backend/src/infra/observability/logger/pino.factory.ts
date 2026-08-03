import { ConfigService } from '@nestjs/config';
import type { Options } from 'pino-http';
import type { AppConfig } from '@config/app.config';
import { CORRELATION_ID_HEADER } from '@common/constants';

export function buildPinoOptions(config: ConfigService): Options {
  const app = config.getOrThrow<AppConfig>('app');
  const isDev = app.env === 'development';

  return {
    level: app.logLevel,
    transport: isDev
      ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l' } }
      : undefined,
    customProps: (req) => ({
      correlationId: req.headers?.[CORRELATION_ID_HEADER],
    }),
    autoLogging: false,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-petpooja-signature"]',
        'req.headers["x-razorpay-signature"]',
        '*.password',
        '*.secret',
        '*.token',
      ],
      censor: '[REDACTED]',
    },
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  };
}
