import { db } from "@/core/config/firebase";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import { CustomerProfile, LoyaltyTier } from "../pages/customersData";

export const adminCustomersService = {
  /**
   * Listen for live incoming customers.
   */
  listenLiveCustomers(
    onUpdate: (customers: CustomerProfile[]) => void,
    onError: (err: Error) => void,
    limitCount = 100
  ) {
    const q = query(
      collection(db, "users"),
      orderBy("lastActiveAt", "desc"),
      limit(limitCount)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const liveCustomers: CustomerProfile[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          // Map Firebase Auth/Firestore fields to CustomerProfile
          liveCustomers.push({
            id: docSnap.id,
            name: data.name || data.displayName || "Unknown",
            email: data.email || "",
            phone: data.phone || data.phoneNumber || "",
            avatar: data.avatar || data.photoURL || `https://i.pravatar.cc/150?u=${docSnap.id}`,
            joinDate: data.createdAt ? new Date(data.createdAt.seconds * 1000).toISOString() : new Date().toISOString(),
            lastActiveAt: data.lastActiveAt ? new Date(data.lastActiveAt.seconds * 1000).toISOString() : new Date().toISOString(),
            tags: data.tags || [],
            loyalty: data.loyalty || {
              tier: "Bronze",
              points: 0,
              lifetimeValuePaise: 0,
              totalOrders: 0,
              nextTierPoints: 1000
            },
            addressCount: data.addressCount || 1,
            segment: data.segment || "New",
            notes: data.notes || ""
          });
        });
        onUpdate(liveCustomers);
      },
      (error) => onError(error)
    );
  }
};
