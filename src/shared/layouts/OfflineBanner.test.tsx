// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * OfflineBanner — observed-offline contract.
 *
 * The regression this pins: a native cold start boots with `isOnline: false`
 * because connectivity is UNCONFIRMED (the plugin has not answered yet). The
 * banner used to treat that as a real disconnection, so every launch showed
 * "You are currently offline…" and then fired "Back online" + a full query
 * invalidation + a store rehydrate on the first successful probe.
 *
 * Rules enforced here:
 *  - the banner renders only while connectivity is genuinely OBSERVED offline;
 *  - the recovery side effects arm only after an observed-offline period and
 *    fire exactly once, never on cold-start confirmation.
 *
 * These tests use the REAL store and the REAL component. The only doubles are
 * the toast module (no sonner DOM) and a real QueryClient whose
 * `invalidateQueries` is spied on.
 */

const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: vi.fn(),
    warning: vi.fn(),
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

/** Set navigator.onLine, returning a restore function. */
function setNavigatorOnline(value: boolean): () => void {
  const original = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value });
  return () => {
    if (original) Object.defineProperty(window.navigator, "onLine", original);
  };
}

/**
 * Fresh module graph. The store's boot value is computed at module load from
 * the platform + navigator, so each case must import it anew.
 */
async function load(native: boolean) {
  vi.resetModules();
  setNative(native);
  const { useAppConfig, selectObservedOffline } = await import(
    "@/core/state/appConfigStore"
  );
  const { OfflineBanner } = await import("./OfflineBanner");
  const { useStoreSelection } = await import("@/features/stores/state/storeStore");
  return { useAppConfig, selectObservedOffline, OfflineBanner, useStoreSelection };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let invalidateCalls = 0;
let rehydrateSpy: ReturnType<typeof vi.spyOn> | null = null;

async function mount(element: React.ReactElement) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  invalidateCalls = 0;
  vi.spyOn(queryClient, "invalidateQueries").mockImplementation(async () => {
    invalidateCalls += 1;
  });
  await act(async () => {
    root!.render(
      <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>,
    );
  });
  // `useHydrated` flips after its mount effect.
  await act(async () => {
    await Promise.resolve();
  });
}

const bannerText = () => document.body.textContent ?? "";

beforeEach(() => {
  toastSuccess.mockClear();
  rehydrateSpy = null;
});

afterEach(async () => {
  const mountedRoot = root;
  if (mountedRoot) await act(async () => mountedRoot.unmount());
  root = null;
  host = null;
  document.body.innerHTML = "";
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
});

describe("native cold start is unconfirmed, not offline", () => {
  it("shows no banner and fires no recovery side effects", async () => {
    const { useAppConfig, OfflineBanner } = await load(true);
    rehydrateSpy = vi.spyOn(
      (await import("@/features/stores/state/storeStore")).useStoreSelection.persist,
      "rehydrate",
    );

    // True cold start: unconfirmed, no authoritative evidence yet.
    expect(useAppConfig.getState().isOnline).toBe(false);
    expect(useAppConfig.getState().connectionStatusKnown).toBe(false);

    await mount(<OfflineBanner />);

    expect(bannerText()).not.toContain("offline");
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(invalidateCalls).toBe(0);
    expect(rehydrateSpy).not.toHaveBeenCalled();
  });

  it("a first native true confirms online without any toast or refresh", async () => {
    const { useAppConfig, OfflineBanner, useStoreSelection } = await load(true);
    rehydrateSpy = vi.spyOn(useStoreSelection.persist, "rehydrate");

    await mount(<OfflineBanner />);

    // The plugin finally answers: authoritative, observed online.
    await act(async () => {
      useAppConfig.getState().setOnline(true);
      await Promise.resolve();
    });

    expect(useAppConfig.getState().connectionStatusKnown).toBe(true);
    expect(bannerText()).not.toContain("offline");
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(invalidateCalls).toBe(0);
    expect(rehydrateSpy).not.toHaveBeenCalled();
  });
});

describe("observed offline then recovery", () => {
  it("shows the banner when offline is observed, then recovers exactly once", async () => {
    const { useAppConfig, OfflineBanner, useStoreSelection } = await load(true);
    rehydrateSpy = vi.spyOn(useStoreSelection.persist, "rehydrate");

    await mount(<OfflineBanner />);

    // Authoritative native evidence: genuinely offline.
    await act(async () => {
      useAppConfig.getState().setOnline(false);
      await Promise.resolve();
    });
    expect(bannerText()).toContain("offline");

    // Recovery.
    await act(async () => {
      useAppConfig.getState().setOnline(true);
      await Promise.resolve();
    });

    expect(bannerText()).not.toContain("offline");
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith("Back online", expect.anything());
    expect(invalidateCalls).toBe(1);
    expect(rehydrateSpy).toHaveBeenCalledTimes(1);
  });

  it("fires the recovery effects only once across repeated flips", async () => {
    const { useAppConfig, OfflineBanner, useStoreSelection } = await load(true);
    rehydrateSpy = vi.spyOn(useStoreSelection.persist, "rehydrate");

    await mount(<OfflineBanner />);

    await act(async () => {
      useAppConfig.getState().setOnline(false);
      await Promise.resolve();
    });
    await act(async () => {
      useAppConfig.getState().setOnline(true);
      await Promise.resolve();
    });
    // No second offline period: a redundant true must not re-toast.
    await act(async () => {
      useAppConfig.getState().setOnline(true);
      await Promise.resolve();
    });

    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(invalidateCalls).toBe(1);
    expect(rehydrateSpy).toHaveBeenCalledTimes(1);
  });
});

describe("browser evidence while unconfirmed", () => {
  it("shows the banner when the browser itself reports offline", async () => {
    const restore = setNavigatorOnline(false);
    try {
      const { useAppConfig, OfflineBanner } = await load(true);

      // Still unconfirmed by the plugin…
      expect(useAppConfig.getState().connectionStatusKnown).toBe(false);
      // …but the browser's own evidence says there is no connection.
      expect(useAppConfig.getState().browserOnlineEvidence).toBe(false);

      await mount(<OfflineBanner />);
      expect(bannerText()).toContain("offline");
    } finally {
      restore();
    }
  });

  it("does not show the banner when the browser reports online but the plugin is silent", async () => {
    const restore = setNavigatorOnline(true);
    try {
      const { OfflineBanner } = await load(true);
      await mount(<OfflineBanner />);
      expect(bannerText()).not.toContain("offline");
      expect(toastSuccess).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});

describe("web parity", () => {
  it("online web start shows no banner and no toast", async () => {
    const restore = setNavigatorOnline(true);
    try {
      const { useAppConfig, OfflineBanner } = await load(false);
      expect(useAppConfig.getState().isOnline).toBe(true);
      expect(useAppConfig.getState().connectionStatusKnown).toBe(true);

      await mount(<OfflineBanner />);
      expect(bannerText()).not.toContain("offline");
      expect(toastSuccess).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("offline web start shows the banner, then recovers once", async () => {
    const restore = setNavigatorOnline(false);
    try {
      const { useAppConfig, OfflineBanner, useStoreSelection } = await load(false);
      rehydrateSpy = vi.spyOn(useStoreSelection.persist, "rehydrate");

      expect(useAppConfig.getState().isOnline).toBe(false);
      expect(useAppConfig.getState().connectionStatusKnown).toBe(true);

      await mount(<OfflineBanner />);
      expect(bannerText()).toContain("offline");

      await act(async () => {
        useAppConfig.getState().setOnline(true);
        await Promise.resolve();
      });

      expect(bannerText()).not.toContain("offline");
      expect(toastSuccess).toHaveBeenCalledTimes(1);
      expect(invalidateCalls).toBe(1);
      expect(rehydrateSpy).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });
});

describe("predicate", () => {
  it("is a pure function of store state", async () => {
    const { selectObservedOffline } = await load(true);

    // Unconfirmed with no browser evidence is NOT observed offline.
    expect(
      selectObservedOffline({ isOnline: false, connectionStatusKnown: false, browserOnlineEvidence: null }),
    ).toBe(false);

    // Unconfirmed but the browser reports offline IS observed offline.
    expect(
      selectObservedOffline({ isOnline: false, connectionStatusKnown: false, browserOnlineEvidence: false }),
    ).toBe(true);

    // Confirmed offline is observed offline.
    expect(
      selectObservedOffline({ isOnline: false, connectionStatusKnown: true, browserOnlineEvidence: true }),
    ).toBe(true);

    // Online is never observed offline.
    expect(
      selectObservedOffline({ isOnline: true, connectionStatusKnown: true, browserOnlineEvidence: false }),
    ).toBe(false);
  });
});
