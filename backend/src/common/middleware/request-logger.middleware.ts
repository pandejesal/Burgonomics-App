import { Injectable, NestMiddleware } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  constructor(private readonly logger: Logger) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      this.logger.log(
        { method: req.method, url: req.originalUrl, status: res.statusCode, durationMs },
        'request',
      );
    });
    next();
  }
}
