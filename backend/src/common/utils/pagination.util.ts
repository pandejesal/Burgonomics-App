import type { PaginatedResult } from '@common/interfaces';

export function toPaginated<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  return { items, total, page, pageSize, hasNext: page * pageSize < total };
}

export function skip(page: number, pageSize: number): number {
  return Math.max(0, (page - 1) * pageSize);
}
