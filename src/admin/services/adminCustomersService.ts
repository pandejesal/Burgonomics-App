import { db } from "@/core/config/firebase";
import { collection, query, orderBy, limit, getDocs, onSnapshot } from "firebase/firestore";
import { CustomerProfile } from "../pages/customersData";

export const adminCustomersService = {
  /**
   * Listen for live incoming customers.
   */
  listenLiveCustomers(
    onUpdate: (customers: CustomerProfile[]) => void,
    onError: (err: Error) => void,
    limitCount = 100,
  ) {
    const q = query(collection(db, "users"), orderBy("lastActiveAt", "desc"), limit(limitCount));

    return onSnapshot(
      q,
      (snapshot) => {
        const liveCustomers: CustomerProfile[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          // Map Firebase Auth/Firestore fields to CustomerProfile
          liveCustomers.push({
            id: docSnap.id,
            fullName: data.name || data.displayName || "Unknown",
            email: data.email || "",
            phone: data.phone || data.phoneNumber || "",
            avatar: data.avatar || data.photoURL || `https://i.pravatar.cc/150?u=${docSnap.id}`,
            city: data.city || "Unknown",
            preferredStore: data.preferredStore || "Main",
            ordersCount: data.ordersCount || 0,
            totalSpent: data.totalSpent || 0,
            loyaltyTier: data.loyaltyTier || "Bronze",
            lastOrderDate: data.lastActiveAt
              ? new Date(data.lastActiveAt.seconds * 1000).toISOString()
              : new Date().toISOString(),
            status: data.status || "Active",
            joinedAt: data.createdAt
              ? new Date(data.createdAt.seconds * 1000).toISOString()
              : new Date().toISOString(),
            gender: data.gender || "Prefer not to say",
            birthday: data.birthday || "",
            preferredLanguage: data.preferredLanguage || "English",
            notes: data.notes || "",
            addresses: data.addresses || [],
            loyalty: data.loyalty || {
              currentPoints: 0,
              lifetimePoints: 0,
              pointsExpiring: 0,
              expiringDate: "",
              tierProgress: 0,
              history: [],
            },
            coupons: data.coupons || [],
            notifications: data.notifications || [],
            supportHistory: data.supportHistory || [],
            auditLogs: data.auditLogs || [],
          } as CustomerProfile);
        });
        onUpdate(liveCustomers);
      },
      (error) => onError(error),
    );
  },
};
