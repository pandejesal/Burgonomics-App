/** @vitest-environment jsdom */
/**
 * FulfillmentDetailsCard — the address row must not lie before the read settles.
 *
 * Measured (ui-independent-defect-review.md, Finding 2):
 *   t~700   quote banner mounts (+141px), fulfilment card 312/189
 *   t~1113  the address read resolves: the "No delivery address selected" row
 *           (+41px, `prev 803h41 -> curr 0`) unmounts, the address block grows
 *           468px, and the card itself changes height 195 -> 160.
 *
 * So the card painted "you have no address" BEFORE the read answered, then
 * removed that row and resized. Three honest states now share one reserved
 * slot:
 *   - pending → a polite status placeholder; nothing claims the address is
 *     missing, and the slot already occupies the settled row's height;
 *   - settled with an address → the address;
 *   - settled with none → the unchanged empty row (the existing launch suite
 *     still asserts that copy for a settled null address).
 *
 * The reservation is on the slot, not on each branch, so every state occupies
 * the same height and resolving cannot move the card.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import type { Address } from "@/features/addresses/models";
import type { Store } from "@/features/stores/models/Store";
import { FulfillmentDetailsCard } from "./FulfillmentDetailsCard";

const store: Store = {
  id: "str_vesu",
  name: "Vesu Outlet",
  address: "1 Main Road, Vesu",
  city: "Surat",
  area: "Vesu",
  lat: 21.15,
  lng: 72.77,
  phone: "+919876543210",
  imageUrl: null,
  hours: null,
  isOpen: true,
  isBusy: false,
  isRecentlyOpened: false,
  supports: { delivery: true, takeaway: true, dineIn: true },
  etaMinutes: 25,
  pickupEtaMinutes: 15,
  pricing: null,
};

const address: Address = {
  id: "addr_home",
  label: "home",
  line1: "12 Test Street",
  city: "Surat",
  pincode: "395007",
  lat: 21.15,
  lng: 72.77,
  isDefault: true,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function render(element: React.ReactElement) {
  await act(async () => root.render(element));
}

const text = () => container.textContent ?? "";
const addressSlot = () => container.querySelector<HTMLElement>("[data-address-slot]");

describe("delivery address row — pending vs settled", () => {
  it("does not claim the address is missing while the read is in flight", async () => {
    await render(
      <FulfillmentDetailsCard
        fulfillment="delivery"
        store={store}
        selectedAddress={null}
        addressPending
      />,
    );

    // The false negative the 41px unmount was made of.
    expect(text()).not.toContain("No delivery address selected");
    expect(text()).not.toContain("+ Add Address");
  });

  it("announces the wait instead of guessing", async () => {
    await render(
      <FulfillmentDetailsCard
        fulfillment="delivery"
        store={store}
        selectedAddress={null}
        addressPending
      />,
    );

    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it("reserves one stable slot height across pending, address and empty", async () => {
    const heights: Array<string | undefined> = [];

    for (const state of [
      { selectedAddress: null, addressPending: true },
      { selectedAddress: address, addressPending: false },
      { selectedAddress: null, addressPending: false },
    ]) {
      await render(<FulfillmentDetailsCard fulfillment="delivery" store={store} {...state} />);
      const slot = addressSlot();
      expect(slot).not.toBeNull();
      heights.push(/min-h-\[[^\]]+\]/.exec(slot!.className)?.[0]);
    }

    // A real floor, identical in all three states — resolving the read cannot
    // change the card's height.
    expect(heights[0]).toBeTruthy();
    expect(new Set(heights).size).toBe(1);
  });

  it("still shows the honest empty state once the read settles with no address", async () => {
    await render(
      <FulfillmentDetailsCard
        fulfillment="delivery"
        store={store}
        selectedAddress={null}
        addressPending={false}
      />,
    );
    expect(text()).toContain("No delivery address selected");
    expect(text()).toContain("+ Add Address");
  });

  it("shows a resolved address even if a pending flag lags behind", async () => {
    await render(
      <FulfillmentDetailsCard
        fulfillment="delivery"
        store={store}
        selectedAddress={address}
        addressPending
      />,
    );
    // A row we can already draw must win over a stale flag: no flicker back to
    // a placeholder, no wasted paint.
    expect(text()).toContain("12 Test Street");
    expect(text()).not.toContain("No delivery address selected");
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("keeps the mode header and the cart escape hatch in every state", async () => {
    for (const pending of [true, false]) {
      await render(
        <FulfillmentDetailsCard
          fulfillment="delivery"
          store={store}
          selectedAddress={null}
          addressPending={pending}
        />,
      );
      expect(text()).toContain("1. Delivery Details");
      expect(text()).toContain("Change Mode");
    }
  });

  it("leaves takeaway and dine-in untouched (no address slot at all)", async () => {
    for (const fulfillment of ["takeaway", "dinein"] as const) {
      await render(
        <FulfillmentDetailsCard
          fulfillment={fulfillment}
          store={store}
          selectedAddress={address}
          addressPending
        />,
      );
      expect(addressSlot()).toBeNull();
    }
  });
});
