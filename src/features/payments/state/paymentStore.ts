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

  setStatus: (s: PaymentStatus) => void;
  setMethod: (m: PaymentMethod) => void;
  setOrder: (o: PaymentOrder | null) => void;
  setVerification: (v: PaymentVerification | null) => void;
  setFailure: (f: PaymentFailure | null) => void;
  reset: () => void;
}

const initial = {
  status: "idle" as PaymentStatus,
  method: "online" as PaymentMethod,
  order: null,
  verification: null,
  failure: null,
};

export const usePaymentStore = create<PaymentState>()((set) => ({
  ...initial,
  setStatus: (s) => set({ status: s }),
  setMethod: (m) => set({ method: m }),
  setOrder: (o) => set({ order: o }),
  setVerification: (v) => set({ verification: v }),
  setFailure: (f) => set({ failure: f }),
  reset: () => set(initial),
}));
