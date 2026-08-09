import { db } from "@/core/config/firebase";
import {
  collectionGroup,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { RichOrder, INITIAL_RICH_ORDERS } from "../pages/ordersData";

export const adminOrdersService = {
  /**
   * Listen for live incoming orders.
   * If storeId is provided, filters by storeId (for Store Managers).
   */
  listenLiveOrders(
    storeId: string | null,
    onUpdate: (orders: RichOrder[]) => void,
    onError: (err: Error) => void
  ) {
    let q;
    if (storeId) {
      q = query(
        collectionGroup(db, "orders"),
        where("store.id", "==", storeId),
        where("orderStatus", "in", ["New", "Preparing", "Ready", "Accepted"]),
        orderBy("placedAt", "asc")
      );
    } else {
      q = query(
        collectionGroup(db, "orders"),
        where("orderStatus", "in", ["New", "Preparing", "Ready", "Accepted"]),
        orderBy("placedAt", "asc")
      );
    }

    return onSnapshot(
      q,
      (snapshot) => {
        const liveOrders: RichOrder[] = [];
        snapshot.forEach((docSnap) => {
          liveOrders.push(docSnap.data() as RichOrder);
        });
        
        // Temporarily blend with INITIAL_RICH_ORDERS if empty, so the UI doesn't look blank 
        // while we are waiting for real orders in demo mode. 
        if (liveOrders.length === 0 && import.meta.env.DEV) {
           const mockLive = INITIAL_RICH_ORDERS.filter(o => ["New", "Preparing", "Ready", "Accepted"].includes(o.orderStatus));
           onUpdate(mockLive);
        } else {
           onUpdate(liveOrders);
        }
      },
      (error) => onError(error)
    );
  },

  /**
   * Fetch historical orders (completed/cancelled) for the given store.
   */
  async getHistory(storeId: string | null, limitCount = 50): Promise<RichOrder[]> {
    let q;
    if (storeId) {
      q = query(
        collectionGroup(db, "orders"),
        where("store.id", "==", storeId),
        where("orderStatus", "in", ["Completed", "Cancelled", "Refunded"]),
        orderBy("placedAt", "desc"),
        limit(limitCount)
      );
    } else {
      q = query(
        collectionGroup(db, "orders"),
        where("orderStatus", "in", ["Completed", "Cancelled", "Refunded"]),
        orderBy("placedAt", "desc"),
        limit(limitCount)
      );
    }

    try {
      const snapshot = await getDocs(q);
      const history: RichOrder[] = [];
      snapshot.forEach((docSnap) => {
        history.push(docSnap.data() as RichOrder);
      });
      return history;
    } catch (e) {
      console.error("Error fetching historical orders:", e);
      return [];
    }
  },

  /**
   * Update the status of an order.
   */
  async updateOrderStatus(
    orderId: string,
    status: RichOrder["orderStatus"],
    timelineUpdate?: { title: string; actor: string; description: string }
  ): Promise<boolean> {
    try {
      const q = query(collectionGroup(db, "orders"), where("id", "==", orderId), limit(1));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) return false;
      
      const orderDoc = snapshot.docs[0];
      const currentData = orderDoc.data() as RichOrder;
      
      const updates: any = { orderStatus: status };
      
      if (timelineUpdate) {
        updates.timeline = [
          ...(currentData.timeline || []),
          {
            ...timelineUpdate,
            timestamp: new Date().toISOString()
          }
        ];
      }
      
      await updateDoc(orderDoc.ref, updates);
      return true;
    } catch (e) {
      console.error("Failed to update order status", e);
      return false;
    }
  }
};
