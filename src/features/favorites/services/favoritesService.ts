/**
 * FavoritesService — mock implementation of the future
 *   GET    /v1/favorites
 *   POST   /v1/favorites
 *   DELETE /v1/favorites/:id
 * endpoints. State lives in the store; this layer simulates latency.
 */
import { delay, ok, fail, type ApiResult } from "@/core/network/http";
import type { Favorite } from "@/features/favorites/models";
import { onAuthUidChange } from "@/features/auth/utils/scopedPersistence";

// Local-only mock: never complete a pending mutation in another account.
let authRevision = 0;
onAuthUidChange(() => { authRevision += 1; });

async function localResult<T>(data: T, milliseconds: number): Promise<ApiResult<T>> {
  const revision = authRevision;
  await delay(milliseconds);
  return revision === authRevision
    ? ok(data)
    : fail("AUTH_CHANGED", "Your session changed. Please try again.");
}

export const favoritesService = {
  async list(): Promise<ApiResult<Favorite[]>> {
    return localResult([], 120);
  },
  async add(_fav: Favorite): Promise<ApiResult<Favorite>> {
    return localResult(_fav, 100);
  },
  async remove(_id: string): Promise<ApiResult<{ id: string }>> {
    return localResult({ id: _id }, 100);
  },
};
