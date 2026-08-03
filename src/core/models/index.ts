/**
 * Application domain models — the shape UI and repositories work with.
 * Mapped from wire DTOs (`@/core/dto`) by feature repositories.
 *
 * Concrete model shapes live alongside their owning feature (e.g.
 * `@/features/menu/models`). Only cross-feature primitives belong here.
 */
export type Money = number;
export type Iso8601 = string;
export type Id = string;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
