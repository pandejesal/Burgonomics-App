import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { MetricsService } from '@infra/observability/metrics/metrics.service';

/**
 * Prisma client wrapper.
 *
 * BOUNDARY RULE: this service may ONLY be injected inside files matching
 * `*.prisma-repository.ts`. Feature services must depend on the abstract
 * repository interface, not on PrismaService directly. This is enforced
 * by the ESLint boundary rule in `.eslintrc.cjs`.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly metrics: MetricsService) {
    const dbUrl =
      process.env.SQL_HOST && process.env.SQL_USER
        ? `postgresql://${process.env.SQL_USER}:${process.env.SQL_PASSWORD}@localhost/${process.env.SQL_DB_NAME}?host=${process.env.SQL_HOST}`
        : process.env.DATABASE_URL;

    super({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
    });
    this.$use(async (params, next) => {
      const model = params.model ?? 'Prisma';
      const operation = params.action;
      const end = this.metrics.dbLatency.startTimer({ model, operation });
      try {
        const result = await next(params);
        this.metrics.dbQueries.inc({ model, operation, status: 'success' });
        return result;
      } catch (err) {
        this.metrics.dbQueries.inc({ model, operation, status: 'error' });
        throw err;
      } finally {
        end();
      }
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
