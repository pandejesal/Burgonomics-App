import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import type {
  ISearchLogRepository,
  RecordSearchInput,
} from '../interfaces/search-log-repository.interface';

@Injectable()
export class SearchLogPrismaRepository implements ISearchLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordSearchInput): Promise<void> {
    await this.prisma.searchQueryLog.create({
      data: {
        userId: input.userId ?? null,
        query: input.query,
        scope: input.scope,
        resultCount: input.resultCount,
      },
    });
  }

  async popular(limit: number, sinceDays: number): Promise<{ query: string; count: number }[]> {
    const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000);
    const rows = await this.prisma.searchQueryLog.groupBy({
      by: ['query'],
      where: { createdAt: { gte: since } },
      _count: { query: true },
      orderBy: { _count: { query: 'desc' } },
      take: limit,
    });
    return rows.map((r) => ({ query: r.query, count: r._count.query }));
  }

  async recentForUser(userId: string, limit: number) {
    return this.prisma.searchQueryLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      distinct: ['query'],
    });
  }
}
