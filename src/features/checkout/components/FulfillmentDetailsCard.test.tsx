/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
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

function radios(): HTMLInputElement[] {
  return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
}

describe("FulfillmentDetailsCard — honest unselected state", () => {
  it("renders a labelled fieldset of only the modes the store supports", async () => {
    await render(
      <FulfillmentDetailsCard
        fulfillment={null}
        store={store}
        supportedModes={["delivery", "takeaway", "dinein"]}
        selectedAddress={address}
        onSelectFulfillment={() => {}}
      />,
    );

    const legend = container.querySelector("legend");
    expect(legend?.textContent).toContain("Choose how you'd like your order");
    // No guessed mode is presented as chosen.
    expect(container.textContent).not.toContain("1. Delivery Details");
    expect(container.textContent).not.toContain("No delivery address selected");
    expect(radios().map((input) => input.value)).toEqual(["delivery", "takeaway", "dinein"]);
    expect(radios().every((input) => input.checked === false)).toBe(true);
  });

  it("offers only the supported modes and never an unsupported default", async () => {
    await render(
      <FulfillmentDetailsCard
        fulfillment={null}
        store={{
          ...store,
          supports: { delivery: false, takeaway: true, dineIn: false },
        }}
        supportedModes={["takeaway"]}
        selectedAddress={address}
        onSelectFulfillment={() => {}}
      />,
    );

    expect(radios().map((input) => input.value)).toEqual(["takeaway"]);
    expect(container.textContent).toContain("Takeaway");
    expect(container.textContent).not.toContain("Delivery");
    expect(container.textContent).not.toContain("Dine-In");
  });

  it("asks for an outlet instead of claiming a mode when the store is unknown", async () => {
    await render(
      <FulfillmentDetailsCard
        fulfillment={null}
        store={null}
        supportedModes={[]}
        selectedAddress={address}
        onSelectFulfillment={() => {}}
      />,
    );

    expect(radios()).toHaveLength(0);
    expect(container.textContent).toContain("Select an outlet");
    expect(container.textContent).not.toContain("1. Delivery Details");
  });

  it("reports the chosen mode through the validated callback", async () => {
    const onSelectFulfillment = vi.fn();
    await render(
      <FulfillmentDetailsCard
        fulfillment={null}
        store={store}
        supportedModes={["delivery", "takeaway", "dinein"]}
        selectedAddress={address}
        onSelectFulfillment={onSelectFulfillment}
      />,
    );

    const takeaway = radios().find((input) => input.value === "takeaway");
    expect(takeaway).toBeDefined();
    await act(async () => takeaway!.click());

    expect(onSelectFulfillment).toHaveBeenCalledTimes(1);
    expect(onSelectFulfillment).toHaveBeenCalledWith("takeaway");
  });
});

describe("FulfillmentDetailsCard — no supported mode still offers an exit", () => {
  it("renders the same Choose Outlet action as the missing-store branch", async () => {
    await render(
      <FulfillmentDetailsCard
        fulfillment={null}
        store={{ ...store, supports: { delivery: false, takeaway: false, dineIn: false } }}
        supportedModes={[]}
        selectedAddress={address}
        onSelectFulfillment={() => {}}
      />,
    );

    expect(container.textContent).toContain("not offering delivery, takeaway, or dine-in");
    const outlet = container.querySelector<HTMLAnchorElement>('a[href="/stores"]');
    expect(outlet).not.toBeNull();
    expect(outlet!.textContent).toContain("Choose Outlet");
  });
});

function StatefulCard() {
  const [mode, setMode] = React.useState<"delivery" | "takeaway" | "dinein" | null>(null);
  return (
    <FulfillmentDetailsCard
      fulfillment={mode}
      store={store}
      supportedModes={["delivery", "takeaway", "dinein"]}
      selectedAddress={address}
      onSelectFulfillment={setMode}
    />
  );
}

describe("FulfillmentDetailsCard — focus and announcement after a real selection", () => {
  it("moves focus to the new section heading and announces the choice", async () => {
    await render(<StatefulCard />);

    const takeaway = radios().find((input) => input.value === "takeaway");
    expect(takeaway).toBeDefined();
    takeaway!.focus();
    await act(async () => takeaway!.click());
    await act(async () => {});

    expect(container.textContent).toContain("1. Pickup Location");
    expect(document.activeElement?.tagName).toBe("H4");
    expect(document.activeElement?.textContent).toContain("Pickup Location");
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Takeaway selected",
    );
  });

  it("does not steal focus on an automatic (non-user) mode change", async () => {
    await render(<StatefulCard />);
    expect(document.activeElement?.tagName).not.toBe("H4");

    await render(
      <FulfillmentDetailsCard
        fulfillment="delivery"
        store={store}
        supportedModes={["delivery", "takeaway", "dinein"]}
        selectedAddress={address}
        onSelectFulfillment={() => {}}
      />,
    );

    expect(container.textContent).toContain("1. Delivery Details");
    expect(document.activeElement?.tagName).not.toBe("H4");
    expect(container.querySelector('[role="status"]')?.textContent ?? "").toBe("");
  });
});

describe("FulfillmentDetailsCard — the three normal modes are unchanged", () => {
  it("delivery keeps the selected-address summary", async () => {
    await render(
      <FulfillmentDetailsCard
        fulfillment="delivery"
        store={store}
        supportedModes={["delivery", "takeaway", "dinein"]}
        selectedAddress={address}
        onSelectFulfillment={() => {}}
      />,
    );

    expect(container.textContent).toContain("1. Delivery Details");
    expect(container.textContent).toContain("12 Test Street");
    expect(radios()).toHaveLength(0);
  });

  it("takeaway keeps the pickup outlet and its phone", async () => {
    await render(
      <FulfillmentDetailsCard
        fulfillment="takeaway"
        store={store}
        supportedModes={["delivery", "takeaway", "dinein"]}
        selectedAddress={address}
        onSelectFulfillment={() => {}}
      />,
    );

    expect(container.textContent).toContain("1. Pickup Location");
    expect(container.textContent).toContain("Vesu Outlet");
    expect(container.querySelector('a[href="tel:+919876543210"]')).not.toBeNull();
  });

  it("dine-in keeps the table field and labels it for assistive tech", async () => {
    await render(
      <FulfillmentDetailsCard
        fulfillment="dinein"
        store={store}
        supportedModes={["delivery", "takeaway", "dinein"]}
        selectedAddress={address}
        tableNumber="7"
        onTableNumberChange={() => {}}
        onSelectFulfillment={() => {}}
      />,
    );

    expect(container.textContent).toContain("1. Dine-In Table Details");
    const input = container.querySelector<HTMLInputElement>("input#checkout-table-number");
    expect(input).not.toBeNull();
    expect(input!.value).toBe("7");
    const label = container.querySelector('label[for="checkout-table-number"]');
    expect(label?.textContent).toContain("Table / Booth Number");
  });
});
