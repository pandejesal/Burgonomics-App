/**
 * FavoritesRepository — the single UI-facing surface for favorites.
 *
 * Future backend integration points:
 *   list()   → GET /v1/favorites
 *   add()    → POST /v1/favorites
 *   remove() → DELETE /v1/favorites/:id
 */
import type { ApiResult } from "@/core/network/http";
import { ok } from "@/core/network/http";
import { generateSecureId } from "@/shared/utils/cryptoUtils";
import { favoritesService } from "@/features/favorites/services/favoritesService";
import { useFavoritesStore } from "@/features/favorites/state/favoritesStore";
import type { Favorite, FavoriteKind } from "@/features/favorites/models";

export class FavoritesRepository {
  readonly name = "FavoritesRepository";

  list(): Favorite[] {
    return useFavoritesStore.getState().items;
  }

  listByKind(kind: FavoriteKind): Favorite[] {
    return this.list().filter((f) => f.kind === kind);
  }

  isFavorited(kind: FavoriteKind, refId: string): boolean {
    return this.list().some((f) => f.kind === kind && f.refId === refId);
  }

  async toggle(fav: Omit<Favorite, "id" | "addedAt">): Promise<ApiResult<{ favorited: boolean }>> {
    const existing = this.list().find((f) => f.kind === fav.kind && f.refId === fav.refId);
    if (existing) {
      const res = await favoritesService.remove(existing.id);
      if (!res.success) return res;
      useFavoritesStore.getState().remove(existing.id);
      return ok({ favorited: false });
    }
    const record: Favorite = {
      ...fav,
      id: `fav_${Date.now().toString(36)}_${generateSecureId(4)}`,
      addedAt: Date.now(),
    };
    const res = await favoritesService.add(record);
    if (!res.success) return res;
    useFavoritesStore.getState().add(record);
    return ok({ favorited: true });
  }

  async remove(id: string): Promise<ApiResult<void>> {
    const res = await favoritesService.remove(id);
    if (!res.success) return res;
    useFavoritesStore.getState().remove(id);
    return ok(undefined);
  }

  clear() {
    useFavoritesStore.getState().clear();
  }
}

export const favoritesRepository = new FavoritesRepository();
