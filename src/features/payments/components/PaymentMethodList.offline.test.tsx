// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CheckoutFeesState } from "@/features/checkout/state/checkoutFeesTypes";

/**
 * PaymentMethodList — observed-offline contract.
 *
 * The regression this pins: on a native cold start `isOnline` is `false` while
 * connectivity is merely UNCONFIRMED. The list used that as proof of being
 * offline: it forced the customer's method to cash and emitted an "Offline Mode
 * Active" toast on every launch, before the plugin had answered anything.
 *
 * Rules enforced here:
 *  - only an OBSERVED offline state may switch the method and toast, and only
 *    once per offline period;
 *  - while unconfirmed, the customer's choice is untouched and the online
 *    option is disabled with honest "Checking connection…" copy — never
 *    "Requires internet connection", which would be a claim.
 *
 * Real component, real store. Only sonner is doubled.
 */

const toastWarning = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({
  toast: {
    warning: toastWarning,
    error: toastError,
    success: vi.fn(),
    info: vi.fn(),
  },
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function setNative(native: boolean): void {
  (window as unknown as { Capacitor?: unknown }).Capacitor = {
    isNativePlatform: () => native,
    getPlatform: () => (native ? "android" : "web"),
  };
}

function setNavigatorOnline(value: boolean): () => void {
  const original = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value });
  return () => {
    if (original) Object.defineProperty(window.navigator, "onLine", original);
  };
}

async function load() {
  vi.resetModules();
  const { useAppConfig } = await import("@/core/state/appConfigStore");
  const { PaymentMethodList } = await import("./PaymentMethodList");
  const { useStoreSelection } = await import("@/features/stores/state/storeStore");
  const { useCheckoutStore } = await import("@/features/checkout/state/checkoutStore");
  const { cashOnDeliveryAvailability } =
    await import("@/features/checkout/state/checkoutFeesTypes");
  // Same decision contract the route supplies: real quote, real mode and a
  // concrete ₹900 bill. The list itself no longer derives eligibility.
  const cashEligibility = (): ListProps["cashEligibility"] =>
    cashOnDeliveryAvailability(
      useCheckoutStore.getState().checkoutFees,
      90_000,
      useStoreSelection.getState().fulfillment,
    );
  return { useAppConfig, PaymentMethodList, useStoreSelection, useCheckoutStore, cashEligibility };
}

/** A restored quote still carrying the retired delivery cash flag. */
function legacyCashFees(orderType: "delivery" | "takeaway"): CheckoutFeesState {
  return {
    status: "ready",
    orderType,
    packagingFee: 0,
    deliveryFee: 0,
    deliveryQuoteId: orderType === "delivery" ? "q_legacy_cash" : null,
    provider: "test",
    expiresAt: Date.now() + 3_600_000,
    cashOnDelivery: { enabled: true, maxOrderValuePaise: null },
  };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

/** The component's REAL prop types — no hand-written structural copy. */
type ListProps = React.ComponentProps<typeof import("./PaymentMethodList").PaymentMethodList>;
type ListMethod = ListProps["value"];

/** Mount with a controlled `value`/`onChange` pair the test can inspect. */
async function mountList(
  Component: React.ComponentType<ListProps>,
  initial: ListMethod,
  cashEligibility: ListProps["cashEligibility"],
) {
  const changes: ListMethod[] = [];
  function Harness() {
    const [method, setMethod] = React.useState<ListMethod>(initial);
    return (
      <Component
        value={method}
        onChange={(next) => {
          changes.push(next);
          setMethod(next);
        }}
        cashEligibility={cashEligibility}
      />
    );
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<Harness />);
  });
  // Flush mount effects deterministically: no wall-clock wait, no polling.
  await act(async () => {});
  return { changes, current: () => changes[changes.length - 1] };
}

const onlineButton = () => document.querySelector<HTMLButtonElement>("#payment-option-online");
const cashButton = () => document.querySelector<HTMLButtonElement>("#payment-option-cash");
const bodyText = () => document.body.textContent ?? "";

beforeEach(() => {
  toastWarning.mockClear();
  toastError.mockClear();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      // Reduced motion makes `motion` settle synchronously instead of driving
      // spring/rAF frames that can outlast a contended parallel worker.
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

afterEach(async () => {
  const mountedRoot = root;
  if (mountedRoot) await act(async () => mountedRoot.unmount());
  root = null;
  host = null;
  document.body.innerHTML = "";
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
});

describe("unconfirmed native start", () => {
  it("keeps the customer's online choice and emits no toast", async () => {
    setNative(true);
    const { useAppConfig, PaymentMethodList, useStoreSelection, cashEligibility } = await load();
    useStoreSelection.setState({ fulfillment: "delivery" });

    // Cold start: not yet confirmed by the plugin.
    expect(useAppConfig.getState().isOnline).toBe(false);
    expect(useAppConfig.getState().connectionStatusKnown).toBe(false);

    const { changes } = await mountList(PaymentMethodList, "online", cashEligibility());

    // The choice must NOT be switched while merely unconfirmed.
    expect(changes).toEqual([]);
    expect(toastWarning).not.toHaveBeenCalled();

    // The option is disabled, but the copy makes no offline claim.
    expect(onlineButton()?.disabled).toBe(true);
    expect(bodyText()).toContain("Checking connection");
    expect(bodyText()).not.toContain("Requires internet connection");
    expect(bodyText()).not.toContain("Offline");
  });
});

describe("observed offline", () => {
  // Counter cash remains a legitimate offline fallback. Delivery cash does not;
  // that case has its own regression below, so this control uses a counter mode.
  it("switches to counter cash once, with the toast, only after offline is observed", async () => {
    setNative(true);
    const { useAppConfig, PaymentMethodList, useStoreSelection, cashEligibility } = await load();
    useStoreSelection.setState({ fulfillment: "takeaway" });

    const { current } = await mountList(PaymentMethodList, "online", cashEligibility());

    // Authoritative native evidence arrives: genuinely offline.
    await act(async () => {
      useAppConfig.getState().setOnline(false);
      await Promise.resolve();
    });

    expect(current()).toBe("cash");
    expect(toastWarning).toHaveBeenCalledTimes(1);
    expect(toastWarning).toHaveBeenCalledWith("Offline Mode Active", expect.anything());
    expect(bodyText()).toContain("Offline");

    // A redundant offline signal must not toast again.
    await act(async () => {
      useAppConfig.getState().setOnline(false);
      await Promise.resolve();
    });
    expect(toastWarning).toHaveBeenCalledTimes(1);
  });
});

describe("web parity", () => {
  it("online web start keeps the online option enabled with no toast", async () => {
    const restore = setNavigatorOnline(true);
    try {
      setNative(false);
      const { useAppConfig, PaymentMethodList, useStoreSelection, cashEligibility } = await load();
      useStoreSelection.setState({ fulfillment: "delivery" });

      expect(useAppConfig.getState().isOnline).toBe(true);

      const { changes } = await mountList(PaymentMethodList, "online", cashEligibility());

      expect(changes).toEqual([]);
      expect(onlineButton()?.disabled).toBe(false);
      expect(toastWarning).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("offline web start switches to counter cash once with the toast", async () => {
    const restore = setNavigatorOnline(false);
    try {
      setNative(false);
      const { useAppConfig, PaymentMethodList, useStoreSelection, cashEligibility } = await load();
      useStoreSelection.setState({ fulfillment: "takeaway" });

      expect(useAppConfig.getState().isOnline).toBe(false);
      expect(useAppConfig.getState().connectionStatusKnown).toBe(true);

      const { current } = await mountList(PaymentMethodList, "online", cashEligibility());

      expect(current()).toBe("cash");
      expect(toastWarning).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });
});

/**
 * Delivery is Razorpay-only even when a persisted/legacy quote still says
 * `cashOnDelivery.enabled: true`. The action boundary already refuses the
 * request; these pin the UI edge the boundary cannot repair: a tender the
 * customer cannot use must not be offered, auto-selected, or described as
 * deliverable cash — online or after an OBSERVED offline answer.
 */
describe("payable delivery ignores a legacy cash-enabled quote", () => {
  it("online delivery offers no delivery-cash tender and keeps the online choice", async () => {
    setNative(true);
    const {
      useAppConfig,
      PaymentMethodList,
      useStoreSelection,
      useCheckoutStore,
      cashEligibility,
    } = await load();
    useStoreSelection.setState({ fulfillment: "delivery" });
    useCheckoutStore.setState({ checkoutFees: legacyCashFees("delivery") });
    // Authoritative online answer: no offline fallback is in play here.
    useAppConfig.getState().setOnline(true);

    const { changes } = await mountList(PaymentMethodList, "online", cashEligibility());

    expect(changes).toEqual([]);
    expect(bodyText()).not.toContain("Cash on Delivery");
    expect(bodyText()).not.toContain("Pay with cash at your doorstep when food is delivered");
    const cash = cashButton();
    expect(cash === null || cash.getAttribute("aria-checked") !== "true").toBe(true);
    expect(cash === null || cash.disabled).toBe(true);
  });

  it("observed-offline delivery never auto-selects cash or emits a fallback toast", async () => {
    setNative(true);
    const {
      useAppConfig,
      PaymentMethodList,
      useStoreSelection,
      useCheckoutStore,
      cashEligibility,
    } = await load();
    useStoreSelection.setState({ fulfillment: "delivery" });
    useCheckoutStore.setState({ checkoutFees: legacyCashFees("delivery") });

    const { changes } = await mountList(PaymentMethodList, "online", cashEligibility());

    // Authoritative native evidence, not the false-offline cold-start window.
    await act(async () => {
      useAppConfig.getState().setOnline(false);
      await Promise.resolve();
    });

    expect(changes).toEqual([]);
    expect(toastWarning).not.toHaveBeenCalled();
    expect(bodyText()).not.toContain("Cash on Delivery");
    expect(bodyText()).not.toContain("Pay with cash at your doorstep when food is delivered");

    // A repeated offline signal must not open the tender either.
    await act(async () => {
      useAppConfig.getState().setOnline(false);
      await Promise.resolve();
    });
    expect(changes).toEqual([]);
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it("a restored stale cash selection is not rendered as a delivery cash choice", async () => {
    setNative(true);
    const {
      useAppConfig,
      PaymentMethodList,
      useStoreSelection,
      useCheckoutStore,
      cashEligibility,
    } = await load();
    useStoreSelection.setState({ fulfillment: "delivery" });
    useCheckoutStore.setState({ checkoutFees: legacyCashFees("delivery") });
    useAppConfig.getState().setOnline(true);

    await mountList(PaymentMethodList, "cash", cashEligibility());

    expect(cashButton()?.getAttribute("aria-checked")).not.toBe("true");
    expect(bodyText()).not.toContain("Cash on Delivery");
    expect(bodyText()).not.toContain("Pay with cash at your doorstep when food is delivered");
  });
});

describe("counter cash fallback stays available when cash is permitted", () => {
  it("observed-offline takeaway with a branch-enabled quote still offers counter cash", async () => {
    setNative(true);
    const {
      useAppConfig,
      PaymentMethodList,
      useStoreSelection,
      useCheckoutStore,
      cashEligibility,
    } = await load();
    useStoreSelection.setState({ fulfillment: "takeaway" });
    useCheckoutStore.setState({ checkoutFees: legacyCashFees("takeaway") });

    const { current } = await mountList(PaymentMethodList, "online", cashEligibility());

    await act(async () => {
      useAppConfig.getState().setOnline(false);
      await Promise.resolve();
    });

    expect(current()).toBe("cash");
    expect(toastWarning).toHaveBeenCalledTimes(1);
    expect(bodyText()).toContain("Pay at Store / Counter");
    expect(bodyText()).toContain("Pay with cash, card, or UPI at the counter when you collect");
    expect(bodyText()).not.toContain("Cash on Delivery");
    expect(bodyText()).not.toContain("Pay with cash at your doorstep when food is delivered");
  });
});
