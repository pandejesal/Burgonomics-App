import type { SearchQueryLog } from '@prisma/client';

export const SEARCH_LOG_REPOSITORY = Symbol('SEARCH_LOG_REPOSITORY');

export interface RecordSearchInput {
  userId?: string | null;
  query: string;
  scope: string;
  resultCount: number;
}

export interface ISearchLogRepository {
  record(input: RecordSearchInput): Promise<void>;
  popular(limit: number, sinceDays: number): Promise<{ query: string; count: number }[]>;
  recentForUser(userId: string, limit: number): Promise<SearchQueryLog[]>;
}
