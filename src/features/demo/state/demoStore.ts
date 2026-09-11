/**
 * Demo / QA control store.
 *
 * Enables end-to-end testing of the customer journey without a live
 * backend:
 *   • simulationMode — when true, mock services serve rich PETPOOJA-
 *     shaped sample data (menu, offers). Default: false, and FORCED false in
 *     production (setters refuse, rehydrate strips stored flags).
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
        // Loop 10/120 prod gate: simulation flags persisted by a dev/QA build
        // share localStorage with prod builds on the same device. Refuse to
        // engage here — prod must never serve mocks or simulated failures.
        if (isProd()) return;
        set({ simulationMode: v });
      },
      setPetpoojaSimulate(v) {
        if (isProd()) return;
        set({ petpoojaSimulateSuccess: v });
      },
      toggleDebugPanel(v) {
        if (isProd()) {
          set({ debugPanelOpen: false });
          return;
        }
        set((s) => ({ debugPanelOpen: typeof v === "boolean" ? v : !s.debugPanelOpen }));
      },
      setError(kind, v) {
        if (isProd()) return;
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
      // Loop 10/120 prod gate: dev/QA-persisted flags must never rehydrate
      // into a prod build (shared localStorage on-device). Strip them here so
      // direct subscribers (routes reading s.simulationMode) stay safe too.
      merge: (persisted, current) => {
        const incoming = (persisted || {}) as Partial<DemoState>;
        if (isProd()) {
          return {
            ...current,
            simulationMode: false,
            petpoojaSimulateSuccess: false,
            errorSims: { ...DEFAULT_ERRORS },
            debugPanelOpen: false,
          };
        }
        return { ...current, ...incoming };
      },
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

/** Convenience — check a single simulated failure. Hard-off in prod. */
export const shouldSimulate = (kind: SimulatedFailure): boolean =>
  !isProd() && useDemoStore.getState().errorSims[kind] === true;

/** Live simulation mode — always false in prod regardless of stored flags. */
export const isSimulationMode = (): boolean =>
  !isProd() && useDemoStore.getState().simulationMode === true;
