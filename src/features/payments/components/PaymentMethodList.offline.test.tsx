// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

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
  return { useAppConfig, PaymentMethodList, useStoreSelection };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

/** The component's REAL prop types — no hand-written structural copy. */
type ListProps = React.ComponentProps<
  typeof import("./PaymentMethodList").PaymentMethodList
>;
type ListMethod = ListProps["value"];

/** Mount with a controlled `value`/`onChange` pair the test can inspect. */
async function mountList(
  Component: React.ComponentType<ListProps>,
  initial: ListMethod = "online",
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

const onlineButton = () =>
  document.querySelector<HTMLButtonElement>("#payment-option-online");
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
    const { useAppConfig, PaymentMethodList, useStoreSelection } = await load();
    useStoreSelection.setState({ fulfillment: "delivery" });

    // Cold start: not yet confirmed by the plugin.
    expect(useAppConfig.getState().isOnline).toBe(false);
    expect(useAppConfig.getState().connectionStatusKnown).toBe(false);

    const { changes } = await mountList(PaymentMethodList, "online");

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
  it("switches to cash once, with the toast, only after offline is observed", async () => {
    setNative(true);
    const { useAppConfig, PaymentMethodList, useStoreSelection } = await load();
    useStoreSelection.setState({ fulfillment: "delivery" });

    const { current } = await mountList(PaymentMethodList, "online");

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
      const { useAppConfig, PaymentMethodList, useStoreSelection } = await load();
      useStoreSelection.setState({ fulfillment: "delivery" });

      expect(useAppConfig.getState().isOnline).toBe(true);

      const { changes } = await mountList(PaymentMethodList, "online");

      expect(changes).toEqual([]);
      expect(onlineButton()?.disabled).toBe(false);
      expect(toastWarning).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("offline web start switches to cash once with the toast", async () => {
    const restore = setNavigatorOnline(false);
    try {
      setNative(false);
      const { useAppConfig, PaymentMethodList, useStoreSelection } = await load();
      useStoreSelection.setState({ fulfillment: "delivery" });

      expect(useAppConfig.getState().isOnline).toBe(false);
      expect(useAppConfig.getState().connectionStatusKnown).toBe(true);

      const { current } = await mountList(PaymentMethodList, "online");

      expect(current()).toBe("cash");
      expect(toastWarning).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });
});
