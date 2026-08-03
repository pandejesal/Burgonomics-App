import type { SearchQueryDto, SearchResultItemDto } from '../dto';

export const SEARCH_DRIVER = Symbol('SEARCH_DRIVER');

export interface SearchDriverResult {
  driver: string;
  items: SearchResultItemDto[];
  total: number;
}

/**
 * Provider-agnostic search abstraction. The default Postgres driver is
 * shipped in this phase; future drivers (Meilisearch, Typesense,
 * ElasticSearch) implement the same contract so the HTTP surface never
 * changes.
 */
export interface ISearchDriver {
  readonly name: string;
  search(input: SearchQueryDto): Promise<SearchDriverResult>;
  autocomplete(prefix: string, limit: number): Promise<string[]>;
  /** Called on catalog updates to keep the driver's index in sync. */
  index(_entityType: 'product' | 'category' | 'offer' | 'store', _id: string): Promise<void>;
  /** Wipe and rebuild the entire index (called by scheduled jobs). */
  rebuild(): Promise<void>;
}
