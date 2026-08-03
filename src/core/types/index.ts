/**
 * Cross-feature TypeScript primitives. Prefer feature-local types when a
 * value is only relevant to one feature.
 */
export type Nullable<T> = T | null;
export type Maybe<T> = T | null | undefined;
export type AsyncResult<T> = Promise<{ data: T; error: null } | { data: null; error: Error }>;
