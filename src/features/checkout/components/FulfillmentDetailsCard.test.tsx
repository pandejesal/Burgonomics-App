/** @vitest-environment jsdom */
/**
 * FulfillmentDetailsCard — launch redesign contract.
 *
 * The owner's checkout shows a read-only "1. … Details" card for the mode the
 * customer picked in the cart (mode changes happen there via "Change Mode").
 * The polish-era interactive mode selector these tests originally covered was
 * removed by the redesign, so this suite asserts the shipped launch behaviour.
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

describe("FulfillmentDetailsCard — launch checkout details card", () => {
  it("delivery shows the selected address and an honest empty state without one", async () => {
    await render(
      <FulfillmentDetailsCard fulfillment="delivery" store={store} selectedAddress={address} />,
    );
    expect(container.textContent).toContain("1. Delivery Details");
    expect(container.textContent).toContain("12 Test Street");

    await render(
      <FulfillmentDetailsCard fulfillment="delivery" store={store} selectedAddress={null} />,
    );
    expect(container.textContent).toContain("No delivery address selected");
    // Mode changes belong to the cart, not this read-only card.
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(0);
    expect(container.textContent).toContain("Change Mode");
  });

  it("takeaway shows the pickup outlet and a dialable phone", async () => {
    await render(
      <FulfillmentDetailsCard fulfillment="takeaway" store={store} selectedAddress={address} />,
    );
    expect(container.textContent).toContain("1. Pickup Location");
    expect(container.textContent).toContain("Vesu Outlet");
    expect(container.querySelector('a[href^="tel:"]')).not.toBeNull();
  });

  it("dine-in asks for the table number and reports edits", async () => {
    const onTableNumberChange = vi.fn();
    await render(
      <FulfillmentDetailsCard
        fulfillment="dinein"
        store={store}
        selectedAddress={null}
        tableNumber=""
        onTableNumberChange={onTableNumberChange}
      />,
    );
    expect(container.textContent).toContain("1. Dine-In Table Details");
    const input = container.querySelector<HTMLInputElement>("input");
    expect(input).not.toBeNull();
    await act(async () => {
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "12");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onTableNumberChange).toHaveBeenCalledWith("12");
  });

  it("never invents a phone link from an unsafe number", async () => {
    await render(
      <FulfillmentDetailsCard
        fulfillment="takeaway"
        store={{ ...store, phone: "12345" }}
        selectedAddress={address}
      />,
    );
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
  });
});
