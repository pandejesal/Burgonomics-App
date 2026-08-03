/**
 * DTO → domain-model mappers.
 *
 * Each feature registers its own mapper module (e.g.
 * `@/features/menu/mappers/productMapper.ts`). Cross-cutting mappers
 * — pagination envelopes, timestamps — live here.
 */
import type { Paginated } from "@/core/models";

export interface PaginatedDto<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export const mapPaginated = <TDto, TModel>(
  dto: PaginatedDto<TDto>,
  mapItem: (item: TDto) => TModel,
): Paginated<TModel> => ({
  items: dto.items.map(mapItem),
  page: dto.page,
  pageSize: dto.page_size,
  total: dto.total,
});

export const mapIsoDate = (raw: string): string => new Date(raw).toISOString();
