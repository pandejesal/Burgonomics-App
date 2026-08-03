export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

export interface CursorPaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasNext: boolean;
}
