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
    try {
      const snap = await getDocs(
        query(collection(db, "banners"), where("active", "==", true), orderBy("order", "asc"))
      );
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch {
      return [];
    }
  },

  async getCategories(): Promise<any[]> {
    try {
      const snap = await getDocs(
        query(collection(db, "categories"), where("active", "==", true), orderBy("order", "asc"))
      );
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch {
      return [];
    }
  },

  async getFeaturedOffers(): Promise<any[]> {
    try {
      const snap = await getDocs(
        query(collection(db, "offers"), where("active", "==", true), orderBy("priority", "desc"), limit(10))
      );
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch {
      return [];
    }
  },

  async getBestSellers(storeId: string): Promise<any[]> {
    try {
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
    } catch {
      return [];
    }
  },

  async getPopularCombos(storeId: string): Promise<any[]> {
    try {
      const snap = await getDocs(
        query(
          collection(db, "combos"),
          where("branchId", "==", storeId),
          where("inStock", "==", true),
          limit(10)
        )
      );
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch {
      return [];
    }
  },

  async getRecommendations(storeId: string): Promise<any[]> {
    try {
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
    } catch {
      return [];
    }
  },

  async getRecentlyViewed(): Promise<any[]> {
    // TODO: Implement based on user's view history
    return [];
  },

  async getQuickReorder(userId: string): Promise<any[]> {
    // Real reorder rail: the customer's most recent orders (either id
    // shape — customerId new docs, userId legacy), newest first. Empty
    // history yields [] (honest empty rail), never fabricated orders.
    const seen = new Set<string>();
    const out: any[] = [];
    for (const field of ["customerId", "userId"] as const) {
      if (out.length >= 5) break;
      let snap;
      try {
        snap = await getDocs(
          query(
            collection(db, "orders"),
            where(field, "==", userId),
            orderBy("createdAt", "desc"),
            limit(10)
          )
        );
      } catch {
        continue;
      }
      for (const d of snap.docs) {
        if (out.length >= 5 || seen.has(d.id)) continue;
        seen.add(d.id);
        const o = d.data() as any;
        const items = Array.isArray(o.items) ? o.items : [];
        const firstName =
          typeof items[0]?.name === "string" && items[0].name ? items[0].name : "Order";
        const extra = items.length > 1 ? ` +${items.length - 1} more` : "";
        const storeName =
          typeof o.store?.name === "string" && o.store.name ? o.store.name : undefined;
        const total =
          typeof o.totals?.grandTotal === "number"
            ? o.totals.grandTotal
            : typeof o.total === "number"
              ? o.total
              : 0;
        const placed =
          typeof o.createdAt === "string"
            ? o.createdAt
            : typeof o.placedAt === "string"
              ? o.placedAt
              : new Date().toISOString();
        out.push({
          id: d.id,
          orderId: d.id,
          title: `${firstName}${extra}`,
          subtitle: storeName ?? "",
          total,
          placedAt: placed,
        });
      }
    }
    return out;
  },
};