// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CartRepository.markSyncState — observed-offline contract.
 *
 * A native cold start boots with `isOnline: false` while connectivity is merely
 * UNCONFIRMED. Reading the raw flag made every launch mark the cart
 * "will sync when back online" before the plugin had answered anything, which
 * is a false statement about the customer's connection.
 *
 * The gate must be the shared `selectObservedOffline` predicate, so the cart
 * agrees with the banner and the payment list.
 */

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

/**
 * Fresh modules: the store computes its boot value at import time from the
 * platform and `navigator.onLine`, so each case needs a new module graph.
 */
async function load() {
  vi.resetModules();
  const { useAppConfig } = await import("@/core/state/appConfigStore");
  const { useCartStore } = await import("@/features/cart/state/cartStore");
  const { cartRepository } = await import("./CartRepository");
  return { useAppConfig, useCartStore, cartRepository };
}

/**
 * `markSyncState` is private. Drive it through a public LOCAL mutation
 * (`removeItem` touches only the store — no network, no offers revalidation)
 * and read the resulting store flag: the observable behaviour, not internals.
 */
async function triggerMutation(
  cartRepository: Awaited<ReturnType<typeof load>>["cartRepository"],
): Promise<void> {
  await cartRepository.removeItem("line_that_does_not_exist");
}

beforeEach(() => {
  vi.resetModules();
  setNative(true);
});

afterEach(() => {
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  document.body.innerHTML = "";
});

describe("unconfirmed native cold start", () => {
  it("does not mark the cart sync-pending before the plugin answers", async () => {
    const { useAppConfig, useCartStore, cartRepository } = await load();

    // Cold start: unconfirmed, not observed offline.
    expect(useAppConfig.getState().isOnline).toBe(false);
    expect(useAppConfig.getState().connectionStatusKnown).toBe(false);

    await triggerMutation(cartRepository);

    // The unconfirmed boot value must not claim the cart is pending sync.
    expect(useCartStore.getState().syncPending).toBe(false);
  });
});

describe("observed offline", () => {
  it("marks the cart sync-pending once offline is observed", async () => {
    const { useAppConfig, useCartStore, cartRepository } = await load();

    // Authoritative native evidence: genuinely offline.
    useAppConfig.getState().setOnline(false);

    await triggerMutation(cartRepository);

    expect(useCartStore.getState().syncPending).toBe(true);
  });

  it("does not mark sync-pending while confirmed online", async () => {
    const { useAppConfig, useCartStore, cartRepository } = await load();

    useAppConfig.getState().setOnline(true);

    await triggerMutation(cartRepository);

    expect(useCartStore.getState().syncPending).toBe(false);
  });
});

describe("browser evidence while the plugin is silent", () => {
  it("marks sync-pending when the browser itself reports offline", async () => {
    const restore = setNavigatorOnline(false);
    try {
      const { useAppConfig, useCartStore, cartRepository } = await load();

      // Unconfirmed by the plugin, but the browser reports no connection, which
      // the shared predicate counts as observed offline.
      expect(useAppConfig.getState().connectionStatusKnown).toBe(false);
      expect(useAppConfig.getState().browserOnlineEvidence).toBe(false);

      await triggerMutation(cartRepository);

      expect(useCartStore.getState().syncPending).toBe(true);
    } finally {
      restore();
    }
  });
});

describe("web parity", () => {
  it("online web start does not mark sync-pending", async () => {
    const restore = setNavigatorOnline(true);
    try {
      setNative(false);
      const { useCartStore, cartRepository } = await load();

      await triggerMutation(cartRepository);

      expect(useCartStore.getState().syncPending).toBe(false);
    } finally {
      restore();
    }
  });

  it("offline web start marks sync-pending", async () => {
    const restore = setNavigatorOnline(false);
    try {
      setNative(false);
      const { useCartStore, cartRepository } = await load();

      await triggerMutation(cartRepository);

      expect(useCartStore.getState().syncPending).toBe(true);
    } finally {
      restore();
    }
  });
});
