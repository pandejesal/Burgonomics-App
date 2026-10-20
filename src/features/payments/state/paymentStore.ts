/**
 * paymentStore — transient UI state for the payment screen.
 *
 * Intentionally NOT persisted: payment attempts are single-session,
 * and re-hydrating a partially-completed order would confuse users.
 * Cart, store, fulfillment, address, and checkout notes are persisted
 * by their own stores and survive the auth round-trip.
 */
import { create } from "zustand";
import type {
  PaymentFailure,
  PaymentMethod,
  PaymentOrder,
  PaymentStatus,
  PaymentVerification,
} from "@/features/payments/models";

interface PaymentState {
  status: PaymentStatus;
  method: PaymentMethod;
  order: PaymentOrder | null;
  verification: PaymentVerification | null;
  failure: PaymentFailure | null;
  /**
   * Internal Firestore order id created BEFORE the gateway opened
   * (PAYMENTS_CONTRACT_SPEC §3). Held so a retry re-creates the SAME order
   * doc and a failed verification can mark it `paymentStatus: "failed"`.
   */
  internalOrderId: string | null;
  gatewayOrderId: string | null;
  reconciliationPending: boolean;
  reconciliationReason: string | null;

  setStatus: (s: PaymentStatus) => void;
  setMethod: (m: PaymentMethod) => void;
  setOrder: (o: PaymentOrder | null) => void;
  setVerification: (v: PaymentVerification | null) => void;
  setFailure: (f: PaymentFailure | null) => void;
  setInternalOrderId: (id: string | null) => void;
  setGatewayOrderId: (id: string | null) => void;
  setReconciliation: (pending: boolean, reason: string | null, internalId?: string | null, gatewayId?: string | null) => void;
  clearReconciliation: () => void;
  reset: () => void;
}

const initial = {
  status: "idle" as PaymentStatus,
  method: "online" as PaymentMethod,
  order: null,
  verification: null,
  failure: null,
  internalOrderId: null,
  gatewayOrderId: null,
  reconciliationPending: false,
  reconciliationReason: null,
};

export const usePaymentStore = create<PaymentState>()((set) => ({
  ...initial,
  setStatus: (s) => set({ status: s }),
  setMethod: (m) => set({ method: m }),
  setOrder: (o) => set({ order: o }),
  setVerification: (v) => set({ verification: v }),
  setFailure: (f) => set({ failure: f }),
  setInternalOrderId: (id) => set({ internalOrderId: id }),
  setGatewayOrderId: (id) => set({ gatewayOrderId: id }),
  setReconciliation: (pending, reason, internalId, gatewayId) => set((state) => ({
    reconciliationPending: pending,
    reconciliationReason: pending ? reason : null,
    internalOrderId: pending ? (internalId ?? state.internalOrderId) : state.internalOrderId,
    gatewayOrderId: pending ? (gatewayId ?? state.gatewayOrderId) : state.gatewayOrderId,
  })),
  clearReconciliation: () => set({ reconciliationPending: false, reconciliationReason: null }),
  reset: () => set(initial),
}));


export interface PaymentReconciliationRecord {
  internalOrderId: string | null;
  gatewayOrderId: string | null;
  reason: string;
  createdAt: number;
}

function reconKey(uid: string): string {
  return `burgonomics:payment_reconciliation:${uid}`;
}

export function persistPaymentReconciliation(
  uid: string | null | undefined,
  record: Omit<PaymentReconciliationRecord, "createdAt">
): void {
  if (!uid || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      reconKey(uid),
      JSON.stringify({ ...record, createdAt: Date.now() })
    );
  } catch {
    // storage unavailable; in-memory store still guards this tab
  }
}

export function loadPaymentReconciliation(
  uid: string | null | undefined
): PaymentReconciliationRecord | null {
  if (!uid || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(reconKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PaymentReconciliationRecord;
    if (!parsed || typeof parsed.reason !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPaymentReconciliation(uid: string | null | undefined): void {
  if (!uid || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(reconKey(uid));
  } catch {
    // ignore
  }
}

export function hydratePaymentReconciliation(uid: string | null | undefined): PaymentReconciliationRecord | null {
  const rec = loadPaymentReconciliation(uid);
  if (rec) {
    usePaymentStore.getState().setReconciliation(
      true,
      rec.reason,
      rec.internalOrderId,
      rec.gatewayOrderId
    );
    usePaymentStore.getState().setInternalOrderId(rec.internalOrderId);
    usePaymentStore.getState().setGatewayOrderId(rec.gatewayOrderId);
  } else {
    usePaymentStore.getState().clearReconciliation();
  }
  return rec;
}
