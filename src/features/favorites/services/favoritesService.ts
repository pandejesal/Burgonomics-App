/**
 * FavoritesService — mock implementation of the future
 *   GET    /v1/favorites
 *   POST   /v1/favorites
 *   DELETE /v1/favorites/:id
 * endpoints. State lives in the store; this layer simulates latency.
 */
import { delay, ok, type ApiResult } from "@/core/network/http";
import type { Favorite } from "@/features/favorites/models";

export const favoritesService = {
  async list(): Promise<ApiResult<Favorite[]>> {
    await delay(120);
    return ok([]);
  },
  async add(_fav: Favorite): Promise<ApiResult<Favorite>> {
    await delay(100);
    return ok(_fav);
  },
  async remove(_id: string): Promise<ApiResult<{ id: string }>> {
    await delay(100);
    return ok({ id: _id });
  },
};
