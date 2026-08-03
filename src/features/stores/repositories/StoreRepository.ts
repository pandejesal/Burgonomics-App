import { storesService } from "@/features/stores/services/storesService";
import type { ApiResult } from "@/core/network/http";
import type { Store } from "@/features/stores/models/Store";

/**
 * Store repository — the ONLY entry point for stores data used by UI.
 * The mock and future API implementations share this interface, so
 * swapping to the real backend is a one-line change in composition.
 */
export interface IStoreRepository {
  list(coords?: { lat: number; lng: number }): Promise<ApiResult<Store[]>>;
  nearby(lat?: number, lng?: number): Promise<ApiResult<Store[]>>;
  byId(id: string): Promise<ApiResult<Store | null>>;
  search(query: string, coords?: { lat: number; lng: number }): Promise<ApiResult<Store[]>>;
}

export class StoreRepository implements IStoreRepository {
  constructor(private readonly service = storesService) {}

  list(coords?: { lat: number; lng: number }) {
    return this.service.list(coords);
  }
  nearby(lat?: number, lng?: number) {
    return this.service.nearby(lat, lng);
  }
  byId(id: string) {
    return this.service.byId(id);
  }
  search(query: string, coords?: { lat: number; lng: number }) {
    return this.service.search(query, coords);
  }
}

export const storeRepository: IStoreRepository = new StoreRepository();
