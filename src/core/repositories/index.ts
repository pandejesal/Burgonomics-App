/**
 * Base repository primitives shared across features.
 *
 * Concrete repositories live inside each feature module
 * (`@/features/<name>/repositories`). They are the ONLY layer feature
 * UI code may consume. This file exposes shared shapes so every
 * repository has a consistent contract.
 */
import type { ApiResult } from "@/core/network/http";

export interface Repository {
  readonly name: string;
}

export type RepoResult<T> = ApiResult<T>;

/**
 * Marker type for the "mock" vs "api" repository swap.
 *
 * Every feature ships two repository implementations behind the same
 * interface — the local store ships today, the API version wires to the
 * production backend. Selection happens at composition time (feature
 * `index.ts`) so UI code never branches on environment.
 */
export type RepositoryVariant = "mock" | "api";
