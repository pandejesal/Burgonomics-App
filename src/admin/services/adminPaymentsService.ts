import { db } from "@/core/config/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import { TransactionDetails, RefundDetails, DiscrepancyDetails } from "../pages/paymentsData";

export const adminPaymentsService = {
  /**
   * Listen for live incoming payment transactions.
   */
  listenLiveTransactions(
    onUpdate: (transactions: TransactionDetails[]) => void,
    onError: (err: Error) => void,
    limitCount = 100
  ) {
    const q = query(
      collection(db, "payments"),
      orderBy("createdAt", "desc"),
      limit(limitCount)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const liveTransactions: TransactionDetails[] = [];
        snapshot.forEach((docSnap) => {
          liveTransactions.push(docSnap.data() as TransactionDetails);
        });
        onUpdate(liveTransactions);
      },
      (error) => onError(error)
    );
  },

  /**
   * Listen for live refunds.
   */
  listenLiveRefunds(
    onUpdate: (refunds: RefundDetails[]) => void,
    onError: (err: Error) => void,
    limitCount = 100
  ) {
    const q = query(
      collection(db, "refunds"),
      orderBy("createdAt", "desc"),
      limit(limitCount)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const liveRefunds: RefundDetails[] = [];
        snapshot.forEach((docSnap) => {
          liveRefunds.push(docSnap.data() as RefundDetails);
        });
        onUpdate(liveRefunds);
      },
      (error) => onError(error)
    );
  },

  /**
   * Listen for live discrepancies.
   */
  listenLiveDiscrepancies(
    onUpdate: (discrepancies: DiscrepancyDetails[]) => void,
    onError: (err: Error) => void,
    limitCount = 100
  ) {
    const q = query(
      collection(db, "payment_discrepancies"),
      orderBy("createdAt", "desc"),
      limit(limitCount)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const liveDiscrepancies: DiscrepancyDetails[] = [];
        snapshot.forEach((docSnap) => {
          liveDiscrepancies.push(docSnap.data() as DiscrepancyDetails);
        });
        onUpdate(liveDiscrepancies);
      },
      (error) => onError(error)
    );
  },

  /**
   * Resolve a discrepancy manually
   */
  async resolveDiscrepancy(
    discrepancyId: string,
    resolvedBy: string,
    notes: string
  ): Promise<boolean> {
    try {
      const docRef = doc(db, "payment_discrepancies", discrepancyId);
      await updateDoc(docRef, {
        status: "RESOLVED",
        resolvedAt: new Date().toISOString(),
        resolvedBy,
        resolutionNotes: notes
      });
      return true;
    } catch (e) {
      console.error("Failed to resolve discrepancy", e);
      return false;
    }
  },
  
  /**
   * Initiate a manual refund
   */
  async processManualRefund(
    paymentId: string,
    amountPaise: number,
    reason: string,
    processedBy: string
  ): Promise<boolean> {
    try {
      // In a real app, this would trigger a Firebase Function to talk to Razorpay API
      // For now, we mock the local state creation of a pending refund record
      // to demonstrate the UI flow correctly connecting to Firestore
      const newRefundRef = doc(collection(db, "refunds"));
      await setDoc(newRefundRef, {
        id: newRefundRef.id,
        paymentId,
        amountPaise,
        reason,
        status: "PENDING",
        processedBy,
        createdAt: new Date().toISOString(),
        gatewayStatus: "initiated"
      });
      return true;
    } catch (e) {
      console.error("Failed to process manual refund", e);
      return false;
    }
  }
};
