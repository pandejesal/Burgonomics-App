import { db } from "@/core/config/firebase";
import { collection, doc, getDocs, setDoc, updateDoc, query } from "firebase/firestore";
import type { RichStore } from "../pages/storesData";
import { fail, ok, type ApiResult } from "@/core/network/http";
import { logger } from "@/core/logging/logger";

const STORES_COLLECTION = "admin_stores";

export const adminStoresService = {
  /**
   * Fetch all rich stores from Firestore
   */
  async listStores(): Promise<ApiResult<RichStore[]>> {
    try {
      const q = query(collection(db, STORES_COLLECTION));
      const snap = await getDocs(q);
      const stores: RichStore[] = [];
      snap.forEach((doc) => {
        stores.push(doc.data() as RichStore);
      });
      return ok(stores);
    } catch (err: any) {
      logger.error("adminStoresService.listStores_failed", err);
      return fail("FETCH_FAILED", err.message || "Failed to load stores");
    }
  },

  /**
   * Bulk insert/update stores (useful for seeding)
   */
  async bulkUpsert(stores: RichStore[]): Promise<ApiResult<void>> {
    try {
      const batchPromises = stores.map((store) =>
        setDoc(doc(db, STORES_COLLECTION, store.id), store),
      );
      await Promise.all(batchPromises);
      return ok(undefined);
    } catch (err: any) {
      logger.error("adminStoresService.bulkUpsert_failed", err);
      return fail("UPSERT_FAILED", err.message || "Failed to upsert stores");
    }
  },

  /**
   * Update a specific store
   */
  async updateStore(storeId: string, updates: Partial<RichStore>): Promise<ApiResult<void>> {
    try {
      await updateDoc(doc(db, STORES_COLLECTION, storeId), updates);
      return ok(undefined);
    } catch (err: any) {
      logger.error("adminStoresService.updateStore_failed", err);
      return fail("UPDATE_FAILED", err.message || "Failed to update store");
    }
  },

  /**
   * Create a new store
   */
  async createStore(store: RichStore): Promise<ApiResult<void>> {
    try {
      await setDoc(doc(db, STORES_COLLECTION, store.id), store);
      return ok(undefined);
    } catch (err: any) {
      logger.error("adminStoresService.createStore_failed", err);
      return fail("CREATE_FAILED", err.message || "Failed to create store");
    }
  },
};
