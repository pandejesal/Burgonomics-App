/** @vitest-environment jsdom */
/**
 * Wave-2 core-features HONESTY tests — audit 2026-10-16, findings M2..M8.
 *
 * Each test is written against the DEFECT it closes: it FAILS on the pre-fix
 * source and passes only once the fabricated value is gone. No snapshotting,
 * no implementation coupling beyond the strings a customer actually reads.
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InvoiceDownloadButton } from "../src/features/orders/components/InvoiceDownloadButton";
import { AddressCard } from "../src/features/addresses/components/AddressCard";
import { AddressForm } from "../src/features/addresses/components/AddressForm";
import { FulfillmentSheet } from "../src/features/stores/components/FulfillmentSheet";
import { StoreCard } from "../src/features/stores/components/StoreCard";
import { mapStoreDoc } from "../src/features/stores/services/storesService";
import { addressRepository } from "../src/features/addresses/repositories/AddressRepository";
import { toast } from "sonner";
import type { Order } from "../src/features/orders/models";
import type { Address } from "../src/features/addresses/models";
import type { Store } from "../src/features/stores/models/Store";

// React act() needs this flag outside of Jest.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// Hoisted so the vi.mock factories below can reach them.
const mocks = vi.hoisted(() => ({
  mapEvents: null as null | {
    click: (e: { latlng: { lat: number; lng: number } }) => void;
  },
  profile: { fullName: "", phone: "" } as { fullName?: string; phone?: string },
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: React.forwardRef(() => null),
  useMap: () => ({ flyTo: vi.fn(), setView: vi.fn(), getZoom: () => 16 }),
  useMapEvents: (events: NonNullable<typeof mocks.mapEvents>) => {
    mocks.mapEvents = events;
  },
}));
vi.mock("../src/features/stores/hooks/useLocationPermission", () => ({
  useLocationPermission: () => ({
    request: async () => ({ status: "unavailable" }),
    coords: null,
    status: "unavailable",
    isLoading: false,
  }),
}));
vi.mock("../src/features/profile/state/profileStore", () => ({
  useProfileStore: (selector: (s: { profile: typeof mocks.profile }) => unknown) =>
    selector({ profile: mocks.profile }),
}));
vi.mock("../src/features/addresses/repositories/AddressRepository", () => ({
  addressRepository: { create: vi.fn(), update: vi.fn() },
}));
vi.mock("../src/core/services/haptics", () => ({
  HapticService: { impact: vi.fn(), selection: vi.fn(), notification: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@capacitor/keyboard", () => ({ Keyboard: { hide: async () => {} } }));
// The vaul Drawer shell is irrelevant here; render sheet content inline.
vi.mock("../src/shared/components/common/BottomSheet", () => ({
  BottomSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
}));

// ---------------------------------------------------------------- fixtures

function makeOrder(overrides: Partial<Order> = {}): Order {
  const base: Order = {
    id: "ord_test_1",
    shortCode: "BG-TEST1",
    status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
    fulfillment: "delivery",
    store: { id: "store_1", name: "Test Kitchen", address: "", area: "", city: "", phone: "" },
    items: [
      {
        lineId: "line_1",
        productId: "prod_1",
        storeId: "store_1",
        name: "Smash Burger",
        unitPrice: 100,
        quantity: 1,
        modifiers: [],
        availability: "available",
      },
    ],
    totals: {
      subtotal: 100,
      itemDiscount: 0,
      promoDiscount: 0,
      taxes: 5,
      cgst: 2.5,
      sgst: 2.5,
      gstRate: 0.05,
      deliveryFee: 0,
      packingFee: 0,
      grandTotal: 100,
      currency: "INR",
    },
    // Cash on delivery, not yet collected.
    payment: { method: "cod", label: "Cash on delivery", status: "CASH_PENDING" },
    placedAt: "2026-10-16T10:00:00.000Z",
  };
  return { ...base, ...overrides };
}

/** A store doc that says NOTHING about open-state or fulfillment support. */
function unknownStoreDoc(): Store {
  const store = mapStoreDoc({ lat: 23.0225, lng: 72.5714, name: "Unknown Outlet" }, "unknown_1");
  if (!store) throw new Error("fixture store was dropped by mapStoreDoc");
  return store;
}

// ---------------------------------------------------------------- harness

/**
 * Mounted roots are tracked so a test that fails mid-way (before its own
 * cleanup) cannot leak a duplicate `#address-entry-form` into the next test.
 */
const mounted: Array<{ done: boolean; cleanup: () => Promise<void> }> = [];

async function mount(ui: React.ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(ui));
  const entry = {
    done: false,
    cleanup: async () => {
      if (entry.done) return;
      entry.done = true;
      await act(async () => root.unmount());
      host.remove();
    },
  };
  mounted.push(entry);
  return { host, cleanup: entry.cleanup };
}

function field(id: string) {
  return document.querySelector<HTMLInputElement>(`[id="${id}"]`)!;
}

/** Type into a React-controlled input without firing focus (jsdom-safe). */
function typeInto(input: HTMLInputElement, value: string) {
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value");
  desc?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function submitForm() {
  const form = document.getElementById("address-entry-form") as HTMLFormElement;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

/**
 * Render the invoice button, click it, and return the HTML the component
 * wrote into the (stubbed) popup window.
 */
async function generateInvoice(order: Order, variant: "button" | "icon") {
  const written: string[] = [];
  vi.stubGlobal(
    "open",
    vi.fn(() => ({
      document: {
        open: vi.fn(),
        write: (html: string) => written.push(html),
        close: vi.fn(),
      },
    })),
  );
  const { host, cleanup } = await mount(
    <InvoiceDownloadButton order={order} variant={variant} />,
  );
  const button = host.querySelector("button")!;
  await act(async () => {
    button.click();
  });
  await cleanup();
  return { html: written.join(""), button };
}

function sheetHtml() {
  return document.body.innerHTML;
}

beforeEach(() => {
  mocks.mapEvents = null;
  mocks.profile = { fullName: "", phone: "" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ json: async () => ({}) }) as unknown as Response),
  );
});

afterEach(async () => {
  for (const entry of mounted.splice(0)) {
    await entry.cleanup();
  }
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------- M2

describe("M2 — invoice document class", () => {
  it("M2: every string describes the same document — an order receipt, not a tax invoice", async () => {
    const { html, button } = await generateInvoice(makeOrder(), "icon");

    // Button title (the surfaced affordance)…
    expect(button.getAttribute("title")).toBe("Download order receipt");
    // …header…
    expect(html).toContain("This is an order receipt, not a GST tax invoice.");
    // …and footer must agree with the title and the header.
    expect(html).toContain("computer-generated order receipt");
    expect(html).not.toContain("computer-generated tax invoice");
    expect(html).not.toContain("GST Invoice");
  });
});

// ---------------------------------------------------------------- M3

describe("M3 — invoice invents payment mode / store address / paid status", () => {
  it("M3: an unpaid COD order with no store address invents none of those facts", async () => {
    const { html } = await generateInvoice(makeOrder(), "button");

    expect(html).not.toContain("ONLINE"); // payment mode is COD, not a guess
    // The seller block legitimately prints the registered legal entity and its
    // Ahmedabad address; the STORE/fulfillment address row must still be blank
    // rather than inventing one from the seller record.
    expect(html).toContain("PANCHTATVA FOODS");
    expect(html).toContain("GSTIN");
    expect(html).toContain("<strong>Address:</strong> —");
    expect(html).not.toContain("Total Amount Paid"); // money has not moved
    expect(html).toContain("Order Total");
    expect(html).toContain("Payment Mode:</strong> COD"); // the real method
  });

  it("M3: the total is labelled from the real payment state", async () => {
    const { html } = await generateInvoice(
      makeOrder({ payment: { method: "online", label: "UPI", status: "paid" } }),
      "button",
    );
    expect(html).toContain("Total Amount Paid");
    expect(html).toContain("Payment Mode:</strong> ONLINE");
  });
});

// ---------------------------------------------------------------- M4

describe("M4 — address form fabricates state and contact name", () => {
  it("M4: state starts empty, is required, and no contact name is invented", async () => {
    mocks.profile = { fullName: "", phone: "98765 43210" };
    vi.mocked(addressRepository.create).mockResolvedValue({
      success: true,
      data: { id: "addr_new_1" },
    } as never);

    const { cleanup } = await mount(<AddressForm onCancel={vi.fn()} onSaved={vi.fn()} />);

    // No fabricated prefill.
    expect(field("address-state").value).toBe("");

    act(() => mocks.mapEvents?.click({ latlng: { lat: 19.076, lng: 72.877 } }));
    await act(async () => {
      typeInto(field("address-line1"), "12 MG Road");
      typeInto(field("address-city"), "Mumbai");
      typeInto(field("address-pincode"), "400050");
    });

    await submitForm();
    expect(document.querySelector("[role=alert]")?.textContent).toContain("Please enter your state.");
    expect(addressRepository.create).not.toHaveBeenCalled();

    // Supply the state explicitly, then save.
    await act(async () => typeInto(field("address-state"), "Maharashtra"));
    await submitForm();

    const payload = vi.mocked(addressRepository.create).mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(payload?.state).toBe("Maharashtra");
    expect(payload?.contactName).toBeUndefined();
    expect(JSON.stringify(payload ?? {})).not.toContain("Guest Customer");

    await cleanup();
  });
});

// ---------------------------------------------------------------- M5

describe("M5 — contact phone can be silently empty", () => {
  it("M5: blocks the save and asks for a contact number instead of storing an empty one", async () => {
    // Signed-in profile with no usable phone number.
    mocks.profile = { fullName: "Synthetic Tester", phone: "" };

    const { cleanup } = await mount(<AddressForm onCancel={vi.fn()} onSaved={vi.fn()} />);
    act(() => mocks.mapEvents?.click({ latlng: { lat: 19.076, lng: 72.877 } }));
    await act(async () => {
      typeInto(field("address-line1"), "12 MG Road");
      typeInto(field("address-city"), "Mumbai");
      typeInto(field("address-state"), "Maharashtra");
      typeInto(field("address-pincode"), "400050");
    });

    await submitForm();

    expect(
      document.querySelector("[role=alert]")?.textContent?.toLowerCase() ?? "",
    ).toContain("add a contact number");
    expect(toast.error).toHaveBeenCalled();
    expect(addressRepository.create).not.toHaveBeenCalled();

    await cleanup();
  });
});

// ---------------------------------------------------------------- M6

describe("M6 — address card can render a stray '+91'", () => {
  const base: Address = {
    id: "addr_1",
    label: "home",
    line1: "12 MG Road",
    city: "Mumbai",
    pincode: "400050",
    isDefault: false,
  };

  it("M6: renders no phone at all when the doc has none", () => {
    const withoutPhone = renderToStaticMarkup(<AddressCard address={base} />);
    expect(withoutPhone).not.toContain("+91");
    expect(withoutPhone).not.toContain("undefined");

    const withEmptyPhone = renderToStaticMarkup(
      <AddressCard address={{ ...base, contactPhone: "" }} />,
    );
    expect(withEmptyPhone).not.toContain("+91");
    expect(withEmptyPhone).not.toContain("undefined");
  });

  it("M6: still renders a real phone number", () => {
    const withPhone = renderToStaticMarkup(
      <AddressCard address={{ ...base, contactName: "Ravi", contactPhone: "9825012345" }} />,
    );
    expect(withPhone).toContain("+91 9825012345");
    expect(withPhone).toContain("Ravi");
  });
});

// ---------------------------------------------------------------- M7

describe("M7 — unknown store open-state / capabilities default to true", () => {
  it("M7: a doc with no isOpen/supports is unknown, not open and all-capable", () => {
    const store = unknownStoreDoc();
    expect(store.isOpen).toBeUndefined();
    expect(store.supports).toEqual({ delivery: false, takeaway: false, dineIn: false });
  });

  it("M7: UI claims neither 'Open now' nor an ungranted fulfillment mode", async () => {
    const store = unknownStoreDoc();
    const { cleanup } = await mount(
      <FulfillmentSheet
        open
        onOpenChange={vi.fn()}
        store={store}
        value={null}
        onConfirm={vi.fn()}
      />,
    );

    const sheet = sheetHtml();
    expect(sheet).not.toContain("Open now");
    expect(sheet).toContain("Hours unavailable");

    const radios = Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="radio"]'));
    expect(radios).toHaveLength(3);
    expect(radios.every((r) => r.disabled)).toBe(true);
    await cleanup();

    const card = renderToStaticMarkup(<StoreCard store={store} />);
    expect(card).not.toContain("Open now");
    expect(card).toContain("Hours unavailable");
  });
});

// ---------------------------------------------------------------- M8

describe("M8 — fulfillment sheet prints a fabricated pickup ETA", () => {
  it("M8: with no pickupEtaMinutes the sheet makes no time promise", async () => {
    const store = unknownStoreDoc();
    const { cleanup } = await mount(
      <FulfillmentSheet
        open
        onOpenChange={vi.fn()}
        store={store}
        value={null}
        onConfirm={vi.fn()}
      />,
    );

    const html = sheetHtml();
    expect(html).not.toContain("20–25 min");
    expect(html).not.toContain("Ready in");
    expect(html).toContain("Prep time on confirmation");
    await cleanup();
  });

  it("M8: a real pickupEtaMinutes still renders", async () => {
    const store = mapStoreDoc(
      { lat: 23.0225, lng: 72.5714, name: "Timed Outlet", pickupEtaMinutes: 12 },
      "timed_1",
    )!;
    const { cleanup } = await mount(
      <FulfillmentSheet
        open
        onOpenChange={vi.fn()}
        store={store}
        value={null}
        onConfirm={vi.fn()}
      />,
    );
    expect(sheetHtml()).toContain("Ready in 12 min");
    await cleanup();
  });
});
