/**
 * Firestore service — centralized Firestore operations for the customer app.
 * All queries go through here for consistency and testability.
 */

import { db } from "@/core/config/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  Timestamp,
} from "firebase/firestore";
import type { Banner, MenuCategory, MenuItem, Offer, Combo, RecommendationItem, QuickReorderItem } from "@/features/home/models";

export const firestoreService = {
  async getBanners(): Promise<any[]> {
    const snap = await getDocs(
      query(collection(db, "banners"), where("active", "==", true), orderBy("order", "asc"))
    );
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async getCategories(): Promise<any[]> {
    const snap = await getDocs(
      query(collection(db, "categories"), where("active", "==", true), orderBy("order", "asc"))
    );
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async getFeaturedOffers(): Promise<any[]> {
    const snap = await getDocs(
      query(collection(db, "offers"), where("active", "==", true), orderBy("priority", "desc"), limit(10))
    );
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async getBestSellers(storeId: string): Promise<any[]> {
    const snap = await getDocs(
      query(
        collection(db, "products"),
        where("branchId", "==", storeId),
        where("isBestSeller", "==", true),
        where("inStock", "==", true),
        limit(10)
      )
    );
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async getPopularCombos(storeId: string): Promise<any[]> {
    const snap = await getDocs(
      query(
        collection(db, "combos"),
        where("branchId", "==", storeId),
        where("inStock", "==", true),
        limit(10)
      )
    );
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async getRecommendations(storeId: string): Promise<any[]> {
    const snap = await getDocs(
      query(
        collection(db, "recommendations"),
        where("storeId", "==", storeId),
        where("active", "==", true),
        orderBy("priority", "desc"),
        limit(10)
      )
    );
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async getRecentlyViewed(): Promise<any[]> {
    // TODO: Implement based on user's view history
    return [];
  },

  async getQuickReorder(userId: string): Promise<any[]> {
    // TODO: Implement based on user's order history
    return [];
  },
};