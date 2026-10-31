/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Store-selection screen: first paint + visibility policy.
 *
 * Pins the two customer-visible regressions from this lane:
 *   1. The first paint may never announce "no stores" before a read has
 *      resolved (idle / GPS prompt / loading all render the skeleton).
 *   2. Only outlets inside the configured radius for the active fulfillment are
 *      listed ? and with no position at all the screen asks for one instead of
 *      showing distant stores.
 *
 * Synthetic coordinates only (origin + km offsets); no real places.
 */

const ORIGIN = { lat: 0, lng: 0 };
const atKm = (km: number) => ({ lat: km / 111.19, lng: 0 });

const fixture = vi.hoisted(() => {
  const state: any = {
    activeStore: null,
    recentStores: [],
    searchHistory: [],
    stores: [],
    nearby: [],
    status: "idle",
    coords: null,
    error: null,
    fulfillment: "delivery",
    isHydrated: true,
    loadStores: () => Promise.resolve(),
    loadNearby: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    searchStores: () => Promise.resolve([]),
    setActiveStore: () => undefined,
    setFulfillment: () => undefined,
    addSearchTerm: () => undefined,
    markPermissionDenied: () => undefined,
    setError: () => undefined,
    clearActiveStore: () => undefined,
  };
  const permission: any = {
    status: "idle",
    coords: null,
    error: null,
    isLoading: false,
    // Mirrors the real hook: the outcome reflects the current permission state.
    request: () =>
      Promise.resolve({ status: permission.status, coords: permission.coords ?? undefined }),
  };
  const cart = { clear: () => Promise.resolve() };
  return {
    state,
    permission,
    cart,
    address: null as any,
    addressState: { addresses: [] as any[], selectedId: null as string | null },
  };
});

const outlet = (id: string, km: number, deliveryRadiusKm?: number) => ({
  id,
  name: `Outlet ${id}`,
  address: "",
  city: "",
  area: "",
  ...atKm(km),
  phone: "",
  imageUrl: null,
  hours: null,
  isOpen: undefined,
  isBusy: false,
  isRecentlyOpened: false,
  supports: { delivery: true, takeaway: true, dineIn: true },
  etaMinutes: null,
  ...(deliveryRadiusKm === undefined ? {} : { deliveryRadiusKm }),
});

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/features/stores", () => ({
  StoreCard: ({ store }: { store: { id: string } }) => (
    <div data-testid="store-card" data-store-id={store.id} />
  ),
  NearestStoreSheet: () => null,
  FulfillmentSheet: () => null,
  useStoreSelection: Object.assign(() => fixture.state, {
    getState: () => fixture.state,
  }),
  storeSupportsFulfillment: () => true,
  useLocationPermission: () => fixture.permission,
}));
vi.mock("@/features/addresses/state/addressStore", () => ({
  useAddressStore: (selector: (s: any) => unknown) => selector(fixture.addressState),
  selectSelectedAddress: () => fixture.address,
  selectAddresses: (s: any) => s.addresses,
}));
vi.mock("@/features/cart", () => ({
  cartRepository: fixture.cart,
  useCartStore: (selector: (s: any) => unknown) => selector({ items: [], storeId: null }),
  selectHasItems: (s: any) => s.items.length > 0,
}));
vi.mock("sonner", () => {
  const toast: any = vi.fn();
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { toast };
});

import { Route } from "./stores";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement;
let root: Root;

async function renderRoute() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const Component = (Route as any).options.component as React.ComponentType;
  await act(async () => {
    root.render(<Component />);
  });
}

const text = () => container.textContent ?? "";
const cards = () =>
  Array.from(container.querySelectorAll("[data-store-id]")).map((el) =>
    el.getAttribute("data-store-id"),
  );
const isLoading = () => !!container.querySelector('[aria-label="Loading stores"]');

beforeEach(() => {
  fixture.state.stores = [];
  fixture.state.recentStores = [];
  fixture.state.nearby = [];
  fixture.state.status = "idle";
  fixture.state.coords = null;
  fixture.state.error = null;
  fixture.state.fulfillment = "delivery";
  fixture.state.activeStore = null;
  fixture.permission.status = "idle";
  fixture.permission.coords = null;
  fixture.address = null;
  fixture.addressState = { addresses: [], selectedId: null };
  fixture.state.markPermissionDenied = vi.fn();
  // Real store semantics, faked minimally: the mode setter mutates the state the
  // component reads on its next render, and store/cart mutations are observable.
  fixture.state.setFulfillment = vi.fn((mode: string | null) => {
    fixture.state.fulfillment = mode;
  });
  fixture.state.setActiveStore = vi.fn();
  fixture.cart.clear = vi.fn();
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  vi.clearAllMocks();
});

describe("first load never claims an empty catalogue", () => {
  it("renders the loading skeleton on the idle first paint", async () => {
    await renderRoute();

    expect(isLoading()).toBe(true);
    expect(text()).not.toMatch(/No stores/);
    expect(cards()).toEqual([]);
  });

  it("keeps the skeleton while the GPS prompt is open", async () => {
    fixture.permission.status = "prompting";
    fixture.state.status = "loading";

    await renderRoute();

    expect(isLoading()).toBe(true);
    expect(text()).not.toMatch(/No stores/);
  });

  it("keeps the skeleton while the directory read is in flight", async () => {
    fixture.state.status = "loading";

    await renderRoute();

    expect(isLoading()).toBe(true);
    expect(text()).not.toMatch(/No stores/);
  });
});

describe("directory status is independent of the location outcome", () => {
  it("keeps loading (never a false empty) when GPS is denied while a saved address is usable", async () => {
    const address = { id: "addr-1", label: "Home", lat: 0, lng: 0 };
    fixture.state.status = "loading";
    fixture.state.stores = [];
    fixture.address = address;
    fixture.addressState = { addresses: [address], selectedId: "addr-1" };
    fixture.permission.status = "blocked";

    await renderRoute();

    expect(isLoading()).toBe(true);
    expect(text()).not.toMatch(/No stores/);
    // The directory read owns `status`; the permission outcome must not rewrite
    // it (that coupling turned a pending read into a false "No stores").
    expect(fixture.state.markPermissionDenied).not.toHaveBeenCalled();
  });
});

describe("explicit fulfillment mode switch", () => {
  // 20 km away: outside the 7 km delivery default, inside the 25 km pickup
  // ceiling, and the outlet supports all three modes.
  const pickupEligible = () => outlet("outlet-20km", 20);

  const radio = (label: string) =>
    Array.from(container.querySelectorAll('[role="radio"]')).find(
      (el) => el.textContent?.trim() === label,
    ) as HTMLElement | undefined;

  const renderInMode = async (mode: "delivery" | null) => {
    fixture.state.fulfillment = mode;
    fixture.state.status = "ready";
    fixture.state.stores = [pickupEligible()];
    fixture.permission.status = "granted";
    fixture.permission.coords = ORIGIN;
    await renderRoute();
  };

  const rerender = async () => {
    const Component = (Route as any).options.component as React.ComponentType;
    await act(async () => {
      root.render(<Component />);
    });
  };

  it.each([["delivery"], ["null"]] as const)(
    "hides the 20 km outlet under the delivery policy (%s)",
    async (mode) => {
      await renderInMode(mode === "null" ? null : "delivery");

      expect(container.querySelector('[aria-label="Fulfillment mode"]')).not.toBeNull();
      expect(cards()).toEqual([]);
      expect(text()).toMatch(/No stores deliver here yet/);
    },
  );

  const expectSwitchRevealsOutlet = async (label: "Takeaway" | "Dine-in", target: string) => {
    const startingMode = label === "Takeaway" ? null : "delivery";
    await renderInMode(startingMode as "delivery" | null);

    expect(cards()).toEqual([]);

    const option = radio(label);
    expect(option).toBeDefined();
    await act(async () => {
      option!.click();
    });

    // The control drives the store's fulfillment only.
    expect(fixture.state.setFulfillment).toHaveBeenCalledWith(target);
    expect(fixture.state.fulfillment).toBe(target);

    // The harness store is not reactive: re-render from the mutated state.
    await rerender();

    expect(cards()).toEqual(["outlet-20km"]);
    expect(radio(label)?.getAttribute("aria-checked")).toBe("true");
    // Never an implicit store choice or cart change.
    expect(fixture.state.activeStore).toBeNull();
    expect(fixture.state.setActiveStore).not.toHaveBeenCalled();
    expect(fixture.cart.clear).not.toHaveBeenCalled();
  };

  it("reveals the pickup-eligible outlet after an explicit Takeaway choice", async () => {
    await expectSwitchRevealsOutlet("Takeaway", "takeaway");
  });

  it("reveals the pickup-eligible outlet after an explicit Dine-in choice", async () => {
    await expectSwitchRevealsOutlet("Dine-in", "dinein");
    // Pickup copy must not claim delivery.
    expect(text()).not.toMatch(/No stores deliver here yet/);
  });
});

describe("no position asks for one instead of listing stores", () => {
  it("shows the location panel, never the empty catalogue, when access is blocked", async () => {
    fixture.state.status = "ready";
    fixture.permission.status = "blocked";

    await renderRoute();

    expect(text()).toMatch(/Location is blocked/);
    expect(text()).toMatch(/Use my location/);
    expect(text()).not.toMatch(/No stores/);
    expect(cards()).toEqual([]);
    // The old copy invited a manual pick without a position; it must be gone.
    expect(text()).not.toMatch(/pick a kitchen manually/i);
    expect(text()).not.toMatch(/still search or pick/i);
  });

  it("offers saved addresses only when the customer actually has one", async () => {
    fixture.state.status = "ready";
    fixture.permission.status = "denied";

    await renderRoute();
    expect(text()).not.toMatch(/Saved addresses/);

    fixture.addressState = {
      addresses: [{ id: "addr-1", label: "Home", lat: 0, lng: 0 }],
      selectedId: null,
    };
    await act(async () => {
      root.unmount();
    });
    container.remove();
    await renderRoute();

    expect(text()).toMatch(/Saved addresses/);
  });
});

describe("only in-radius stores are listed", () => {
  it("hides an outlet outside its delivery radius and keeps the near one", async () => {
    fixture.state.status = "ready";
    fixture.state.stores = [outlet("near", 1, 5), outlet("far", 60, 5)];
    fixture.permission.status = "granted";
    fixture.permission.coords = ORIGIN;

    await renderRoute();

    expect(cards()).toEqual(["near"]);
    expect(text()).not.toMatch(/No stores/);
  });

  it("filters the recently-viewed row with the same policy", async () => {
    fixture.state.status = "ready";
    fixture.state.stores = [outlet("near", 1, 5)];
    fixture.state.recentStores = [outlet("far-recent", 60, 5)];
    fixture.permission.status = "granted";
    fixture.permission.coords = ORIGIN;

    await renderRoute();

    expect(cards()).not.toContain("far-recent");
    expect(text()).not.toMatch(/Recently viewed/);
  });

  it("keeps the honest empty copy when the directory is genuinely empty", async () => {
    fixture.state.status = "ready";
    fixture.permission.status = "granted";
    fixture.permission.coords = ORIGIN;

    await renderRoute();

    expect(text()).toMatch(/No stores found/);
    expect(text()).toMatch(/No stores are available right now/);
    expect(cards()).toEqual([]);
  });

  it("explains an all-out-of-radius result instead of listing far stores", async () => {
    fixture.state.status = "ready";
    fixture.state.stores = [outlet("far", 60, 5)];
    fixture.permission.status = "granted";
    fixture.permission.coords = ORIGIN;

    await renderRoute();

    expect(text()).toMatch(/No stores deliver here yet/);
    expect(text()).not.toMatch(/No stores are available right now/);
    expect(cards()).toEqual([]);
  });

  it("surfaces a real load failure instead of an empty catalogue", async () => {
    fixture.state.status = "error";
    fixture.state.error = "The store directory could not be loaded.";

    await renderRoute();

    expect(text()).toMatch(/We couldn.t load stores/);
    expect(text()).not.toMatch(/No stores/);
  });
});
