/**
 * Demo / QA control store.
 *
 * Enables end-to-end testing of the customer journey without a live
 * backend:
 *   • simulationMode — when true, mock services serve rich PETPOOJA-
 *     shaped sample data (menu, offers). Default: true.
 *   • debugPanelOpen — floating dev-only inspector.
 *   • errorSims — toggles that force specific failure paths for QA.
 *
 * This module MUST NOT be referenced from production business logic —
 * only mock services, adapters, and the debug panel read from it. In
 * production builds the debug panel and its store never mount.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { generateSecureId } from "@/shared/utils/cryptoUtils";
import { isProd } from "@/core/config/env";

export type SimulatedFailure =
  | "payment"
  | "network_timeout"
  | "petpooja_down"
  | "stock_unavailable"
  | "coupon_invalid"
  | "order_rejected";

export interface DemoRecentApiCall {
  id: string;
  at: string;
  label: string;
  status: "ok" | "fail";
  ms: number;
  meta?: Record<string, unknown>;
}

export type RazorpayVerifyStatus = "idle" | "pending" | "verified" | "failed";
export type RazorpayPaymentStatus =
  "idle" | "creating_order" | "checkout_open" | "processing" | "success" | "failed" | "cancelled";

export interface RazorpayDiagnostics {
  mode: "live_test" | "simulation";
  keyLoaded: boolean;
  sdkLoaded: boolean;
  backendConnected: boolean;
  lastOrderId?: string;
  lastPaymentId?: string;
  verifyStatus: RazorpayVerifyStatus;
  paymentStatus: RazorpayPaymentStatus;
  lastLatencyMs?: number;
  lastError?: { code: string; message: string; at: string };
  updatedAt?: string;
}

interface DemoState {
  /** Serve PETPOOJA sample data through the mock services. */
  simulationMode: boolean;
  /** PETPOOJA order submission works even without sandbox creds. */
  petpoojaSimulateSuccess: boolean;
  /** Show floating debug panel (dev only). */
  debugPanelOpen: boolean;
  /** Toggleable synthetic failures. */
  errorSims: Record<SimulatedFailure, boolean>;

  /** Runtime observability the debug panel reads. */
  lastPaymentId?: string;
  lastRazorpayOrderId?: string;
  lastBackendOrderId?: string;
  lastPetpoojaOrderId?: string;
  recentApiCalls: DemoRecentApiCall[];
  razorpay: RazorpayDiagnostics;

  setSimulationMode(v: boolean): void;
  setPetpoojaSimulate(v: boolean): void;
  toggleDebugPanel(v?: boolean): void;
  setError(kind: SimulatedFailure, v: boolean): void;
  clearErrors(): void;

  recordPayment(rzpOrderId: string, paymentId: string): void;
  recordBackendOrder(id: string): void;
  recordPetpoojaOrder(id: string): void;
  pushApiCall(call: Omit<DemoRecentApiCall, "id" | "at">): void;
  patchRazorpay(patch: Partial<RazorpayDiagnostics>): void;
}

const DEFAULT_ERRORS: Record<SimulatedFailure, boolean> = {
  payment: false,
  network_timeout: false,
  petpooja_down: false,
  stock_unavailable: false,
  coupon_invalid: false,
  order_rejected: false,
};

export const useDemoStore = create<DemoState>()(
  persist(
    (set) => ({
      simulationMode: false,
      petpoojaSimulateSuccess: false,
      debugPanelOpen: false,
      errorSims: { ...DEFAULT_ERRORS },
      recentApiCalls: [],
      razorpay: {
        mode: "simulation",
        keyLoaded: false,
        sdkLoaded: false,
        backendConnected: false,
        verifyStatus: "idle",
        paymentStatus: "idle",
      },

      patchRazorpay(patch) {
        set((s) => ({
          razorpay: { ...s.razorpay, ...patch, updatedAt: new Date().toISOString() },
        }));
      },

      setSimulationMode(v) {
        set({ simulationMode: v });
      },
      setPetpoojaSimulate(v) {
        set({ petpoojaSimulateSuccess: v });
      },
      toggleDebugPanel(v) {
        set((s) => ({ debugPanelOpen: typeof v === "boolean" ? v : !s.debugPanelOpen }));
      },
      setError(kind, v) {
        set((s) => ({ errorSims: { ...s.errorSims, [kind]: v } }));
      },
      clearErrors() {
        set({ errorSims: { ...DEFAULT_ERRORS } });
      },

      recordPayment(rzpOrderId, paymentId) {
        set({ lastRazorpayOrderId: rzpOrderId, lastPaymentId: paymentId });
      },
      recordBackendOrder(id) {
        set({ lastBackendOrderId: id });
      },
      recordPetpoojaOrder(id) {
        set({ lastPetpoojaOrderId: id });
      },
      pushApiCall(call) {
        set((s) => ({
          recentApiCalls: [
            {
              id: `${Date.now()}_${generateSecureId(4)}`,
              at: new Date().toISOString(),
              ...call,
            },
            ...s.recentApiCalls,
          ].slice(0, 25),
        }));
      },
    }),
    {
      name: "burg.demo.v1",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" && window.localStorage
          ? window.localStorage
          : undefinedStorage,
      ),
      partialize: (s) => ({
        simulationMode: s.simulationMode,
        petpoojaSimulateSuccess: s.petpoojaSimulateSuccess,
        errorSims: s.errorSims,
      }),
    },
  ),
);

const undefinedStorage: Storage = {
  length: 0,
  clear: () => {},
  getItem: () => null,
  key: () => null,
  removeItem: () => {},
  setItem: () => {},
};

/** Is the debug surface allowed in this build? */
export const isDebugAllowed = (): boolean => !isProd();

/** Convenience — check a single simulated failure. */
export const shouldSimulate = (kind: SimulatedFailure): boolean =>
  useDemoStore.getState().errorSims[kind] === true;
