import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CorrelationIdMiddleware } from './middleware/correlation-id.middleware';
import { RequestLoggerMiddleware } from './middleware/request-logger.middleware';

/**
 * Cross-cutting module. Registers request-scoped middleware and
 * re-exports common utilities. Guards / filters / interceptors are
 * applied globally in `main.ts`.
 */
@Global()
@Module({})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware, RequestLoggerMiddleware).forRoutes('*');
  }
}
