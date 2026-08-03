import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import type { SearchQueryDto, SearchResultItemDto } from '../dto';
import type { ISearchDriver, SearchDriverResult } from './search-driver.interface';

/**
 * Default PostgreSQL-backed search driver. Uses case-insensitive
 * `contains` matching with a simple ranking placeholder; a future
 * driver (Meilisearch/Typesense/Elastic) can replace this without any
 * change to the HTTP surface.
 */
@Injectable()
export class PostgresSearchDriver implements ISearchDriver {
  readonly name = 'postgres';

  constructor(private readonly prisma: PrismaService) {}

  async search(input: SearchQueryDto): Promise<SearchDriverResult> {
    const scope = input.scope ?? 'all';
    const limit = input.limit;
    const items: SearchResultItemDto[] = [];

    const wantsProducts = scope === 'all' || scope === 'products';
    const wantsCategories = scope === 'all' || scope === 'categories';
    const wantsOffers = scope === 'all' || scope === 'offers';
    const wantsStores = scope === 'all' || scope === 'stores';

    if (wantsProducts) {
      const productWhere: Prisma.ProductWhereInput = {
        isAvailable: true,
        OR: [
          { name: { contains: input.q, mode: 'insensitive' } },
          { description: { contains: input.q, mode: 'insensitive' } },
          { tags: { has: input.q } },
        ],
      };
      if (input.storeId) {
        productWhere.OR = [
          {
            storeAvailability: {
              some: { storeId: input.storeId, isAvailable: true, inStock: true },
            },
          },
          { storeAvailability: { none: { storeId: input.storeId } } },
        ];
      }
      const rows = await this.prisma.product.findMany({
        where: productWhere,
        take: limit,
        include: { images: { where: { isPrimary: true }, take: 1 } },
        orderBy: [{ isPopular: 'desc' }, { displayOrder: 'asc' }],
      });
      items.push(
        ...rows.map((p) => ({
          id: p.id,
          type: 'product' as const,
          title: p.name,
          subtitle: p.shortDescription ?? p.description ?? undefined,
          imageUrl: p.images[0]?.url,
          score: PostgresSearchDriver.score(p.name, input.q, p.isPopular ? 0.25 : 0),
        })),
      );
    }

    if (wantsCategories) {
      const rows = await this.prisma.category.findMany({
        where: { isVisible: true, name: { contains: input.q, mode: 'insensitive' } },
        take: limit,
        orderBy: [{ displayOrder: 'asc' }],
      });
      items.push(
        ...rows.map((c) => ({
          id: c.id,
          type: 'category' as const,
          title: c.name,
          subtitle: c.description ?? undefined,
          imageUrl: c.imageUrl ?? undefined,
          score: PostgresSearchDriver.score(c.name, input.q),
        })),
      );
    }

    if (wantsOffers) {
      const rows = await this.prisma.offer.findMany({
        where: {
          isActive: true,
          OR: [
            { title: { contains: input.q, mode: 'insensitive' } },
            { description: { contains: input.q, mode: 'insensitive' } },
            { code: { contains: input.q, mode: 'insensitive' } },
          ],
        },
        take: limit,
        orderBy: [{ displayOrder: 'asc' }],
      });
      items.push(
        ...rows.map((o) => ({
          id: o.id,
          type: 'offer' as const,
          title: o.title,
          subtitle: o.description ?? undefined,
          imageUrl: o.bannerUrl ?? undefined,
          score: PostgresSearchDriver.score(o.title, input.q),
        })),
      );
    }

    if (wantsStores) {
      const rows = await this.prisma.store.findMany({
        where: {
          OR: [
            { name: { contains: input.q, mode: 'insensitive' } },
            { address: { contains: input.q, mode: 'insensitive' } },
            { city: { contains: input.q, mode: 'insensitive' } },
          ],
        },
        take: limit,
      });
      items.push(
        ...rows.map((s) => ({
          id: s.id,
          type: 'store' as const,
          title: s.name,
          subtitle: s.address,
          score: PostgresSearchDriver.score(s.name, input.q),
        })),
      );
    }

    items.sort((a, b) => b.score - a.score);
    const trimmed = items.slice(0, limit);
    return { driver: this.name, items: trimmed, total: items.length };
  }

  async autocomplete(prefix: string, limit: number): Promise<string[]> {
    const [products, categories] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where: { isAvailable: true, name: { startsWith: prefix, mode: 'insensitive' } },
        take: limit,
        select: { name: true },
      }),
      this.prisma.category.findMany({
        where: { isVisible: true, name: { startsWith: prefix, mode: 'insensitive' } },
        take: limit,
        select: { name: true },
      }),
    ]);
    const merged = [...products.map((p) => p.name), ...categories.map((c) => c.name)];
    return [...new Set(merged)].slice(0, limit);
  }

  async index(_entityType: 'product' | 'category' | 'offer' | 'store', _id: string): Promise<void> {
    // no-op — Postgres indexes are maintained by the database itself.
  }

  async rebuild(): Promise<void> {
    // no-op — Postgres indexes are maintained by the database itself.
  }

  private static score(field: string, query: string, boost = 0): number {
    const f = field.toLowerCase();
    const q = query.toLowerCase();
    if (f === q) return 1 + boost;
    if (f.startsWith(q)) return 0.8 + boost;
    if (f.includes(q)) return 0.5 + boost;
    return 0.1 + boost;
  }
}
