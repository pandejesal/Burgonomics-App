import { Inject, Injectable } from '@nestjs/common';
import { CacheService } from '@infra/cache/cache.service';
import type { SearchQueryDto, SearchResponseDto } from '../dto';
import { SEARCH_DRIVER, type ISearchDriver } from '../drivers/search-driver.interface';
import {
  SEARCH_LOG_REPOSITORY,
  type ISearchLogRepository,
} from '../repositories/interfaces/search-log-repository.interface';

const AUTOCOMPLETE_TTL = 30;
const POPULAR_TTL = 300;

@Injectable()
export class SearchService {
  constructor(
    @Inject(SEARCH_DRIVER) private readonly driver: ISearchDriver,
    @Inject(SEARCH_LOG_REPOSITORY) private readonly log: ISearchLogRepository,
    private readonly cache: CacheService,
  ) {}

  async search(input: SearchQueryDto, userId?: string | null): Promise<SearchResponseDto> {
    const start = Date.now();
    const res = await this.driver.search(input);
    await this.log.record({
      userId,
      query: input.q,
      scope: input.scope ?? 'all',
      resultCount: res.total,
    });
    return {
      query: input.q,
      results: res.items,
      total: res.total,
      took: Date.now() - start,
      driver: res.driver,
    };
  }

  async autocomplete(prefix: string, limit: number): Promise<string[]> {
    return this.cache.wrap(`search:ac:${prefix}:${limit}`, AUTOCOMPLETE_TTL, () =>
      this.driver.autocomplete(prefix, limit),
    );
  }

  async popular(limit = 10, sinceDays = 7) {
    return this.cache.wrap(`search:popular:${limit}:${sinceDays}`, POPULAR_TTL, () =>
      this.log.popular(limit, sinceDays),
    );
  }

  recent(userId: string, limit = 10) {
    return this.log.recentForUser(userId, limit);
  }

  /** Hook called on catalog changes to keep external indexes fresh. */
  reindex(entityType: 'product' | 'category' | 'offer' | 'store', id: string) {
    return this.driver.index(entityType, id);
  }
}
