import { db } from "@/core/config/firebase";
import { collection, doc, setDoc, getDocs, query, where, orderBy } from "firebase/firestore";

export interface OrderData {
  id: string;
  userId: string;
  items: any[];
  total: number;
  status: string;
  createdAt: string;
  paymentMethod: string;
}

export const orderService = {
  async createOrder(orderData: OrderData): Promise<void> {
    const orderRef = doc(db, "orders", orderData.id);
    await setDoc(orderRef, orderData);
  },

  async getUserOrders(userId: string): Promise<OrderData[]> {
    const q = query(
      collection(db, "orders"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc) => doc.data() as OrderData);
  },
};
