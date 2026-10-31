/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AddressForm } from "./AddressForm";
import { addressRepository } from "@/features/addresses/repositories/AddressRepository";
import { toast } from "sonner";
import type { Address } from "@/features/addresses/models";

// React act() needs this flag outside of Jest.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// Map spies + captured leaflet event handlers, hoisted so the module-mock
// factory can reach them. Nothing here touches a real map or network.
const map = vi.hoisted(() => ({
  flyTo: vi.fn(),
  setView: vi.fn(),
  events: null as null | {
    click: (e: { latlng: { lat: number; lng: number } }) => void;
  },
}));

// Mutable location-hook state: tests pick status/coords without real GPS.
const loc = vi.hoisted(() => ({
  current: {
    request: vi.fn(async () => ({ status: "unavailable" as const })),
    coords: null as { lat: number; lng: number } | null,
    status: "unavailable" as string,
    isLoading: false,
  } as {
    request: () => Promise<{ status: string }>;
    coords: { lat: number; lng: number } | null;
    status: string;
    isLoading: boolean;
  },
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: React.forwardRef(() => null),
  useMap: () => ({ flyTo: map.flyTo, setView: map.setView, getZoom: () => 16 }),
  useMapEvents: (events: NonNullable<typeof map.events>) => {
    map.events = events;
  },
}));
vi.mock("@/features/stores/hooks/useLocationPermission", () => ({
  useLocationPermission: () => loc.current,
}));
vi.mock("@/features/profile/state/profileStore", () => ({
  useProfileStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ profile: { fullName: "Synthetic Tester", phone: "98765 43210" } }),
}));
vi.mock("@/features/addresses/repositories/AddressRepository", () => ({
  addressRepository: { create: vi.fn(), update: vi.fn() },
}));
vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn(), selection: vi.fn(), notification: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@capacitor/keyboard", () => ({ Keyboard: { hide: vi.fn(async () => {}) } }));

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** Type into a React-controlled input without firing focus (jsdom-safe). */
function typeInto(input: HTMLInputElement, value: string) {
  const desc = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input),
    "value",
  );
  desc?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function geocodeReply(parts: Record<string, unknown>): Response {
  return { json: async () => ({ address: { ...parts } }) } as unknown as Response;
}

async function mount(ui: React.ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(ui));
  return {
    root,
    cleanup: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

function field(id: string) {
  return document.querySelector<HTMLInputElement>(`[id="${id}"]`)!;
}

async function submitForm() {
  const form = document.getElementById("address-entry-form") as HTMLFormElement;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  map.flyTo.mockClear();
  map.setView.mockClear();
  map.events = null;
  // Block every non-local request by default; tests that need a geocode
  // reply override this with a controlled deferred stub.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ json: async () => ({}) }) as unknown as Response),
  );
  loc.current = {
    request: vi.fn(async () => ({ status: "unavailable" as const })),
    coords: null,
    status: "unavailable",
    isLoading: false,
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  Reflect.deleteProperty(window, "matchMedia");
});

it("exposes stable field ids with associated labels", async () => {
  const { cleanup } = await mount(
    <AddressForm onCancel={vi.fn()} onSaved={vi.fn()} />,
  );
  for (const id of [
    "address-line1",
    "address-line2",
    "address-landmark",
    "address-city",
    "address-state",
    "address-pincode",
  ]) {
    expect(field(id), id).not.toBeNull();
    const label = document.querySelector<HTMLElement>(`label[for="${id}"]`);
    expect(label, `label for ${id}`).not.toBeNull();
    expect(label!.textContent?.trim().length).toBeGreaterThan(0);
  }
  await cleanup();
});

it("requires a city before saving — no fabricated default is submitted", async () => {
  const onSaved = vi.fn();
  const { cleanup } = await mount(
    <AddressForm onCancel={vi.fn()} onSaved={onSaved} />,
  );
  expect(field("address-city").value).toBe("");

  await act(async () => {
    typeInto(field("address-line1"), "B-42, Sunshine Heights");
    typeInto(field("address-pincode"), "380001");
  });
  await submitForm();

  expect(document.querySelector('[role=alert]')?.textContent).toContain(
    "Please enter your city.",
  );
  expect(toast.error).toHaveBeenCalledWith("Please enter your city.");
  expect(addressRepository.create).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();

  await cleanup();
});

it("keeps the confirmed-pin requirement for new addresses", async () => {
  const { cleanup } = await mount(
    <AddressForm onCancel={vi.fn()} onSaved={vi.fn()} />,
  );
  await act(async () => {
    typeInto(field("address-line1"), "B-42, Sunshine Heights");
    typeInto(field("address-city"), "Ahmedabad");
    typeInto(field("address-pincode"), "380001");
  });
  await submitForm();

  expect(document.querySelector('[role=alert]')?.textContent).toContain(
    "confirm your delivery pin location",
  );
  expect(addressRepository.create).not.toHaveBeenCalled();

  await cleanup();
});

it("fills untouched fields from a pin tap geocode and saves the trimmed values", async () => {
  const pending = deferred<Response>();
  vi.stubGlobal("fetch", vi.fn(() => pending.promise));
  vi.mocked(addressRepository.create).mockResolvedValue({
    success: true,
    data: { id: "addr_new_1" },
  } as never);
  const onSaved = vi.fn();
  const { cleanup } = await mount(
    <AddressForm onCancel={vi.fn()} onSaved={onSaved} />,
  );

  act(() => map.events?.click({ latlng: { lat: 19.076, lng: 72.877 } }));
  await act(async () =>
    pending.resolve(geocodeReply({
      city: "Mumbai",
      town: "Mumbai",
      postcode: "400050",
      state: "Maharashtra",
      house_number: "12",
      road: "MG Road",
    })),
  );

  expect(field("address-city").value).toBe("Mumbai");
  expect(field("address-pincode").value).toBe("400050");
  expect(field("address-state").value).toBe("Maharashtra");
  expect(field("address-line1").value).toBe("12 MG Road");

  await act(async () => {
    typeInto(field("address-line1"), "  Flat 9, Sea View Apartments  ");
  });
  await submitForm();

  expect(addressRepository.create).toHaveBeenCalledWith(
    expect.objectContaining({
      line1: "Flat 9, Sea View Apartments",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400050",
      lat: 19.076,
      lng: 72.877,
      contactName: "Synthetic Tester",
    }),
  );
  expect(onSaved).toHaveBeenCalledWith({ id: "addr_new_1" });

  await cleanup();
});

it("never overwrites loaded fields of an edited address when a pin geocode resolves", async () => {
  const pending = deferred<Response>();
  vi.stubGlobal("fetch", vi.fn(() => pending.promise));
  const initial: Address = {
    id: "addr_edit_1",
    label: "home",
    line1: "B-42, Sunshine Heights",
    city: "Ahmedabad",
    state: "Gujarat",
    pincode: "380001",
    lat: 23.0225,
    lng: 72.5714,
    isDefault: false,
  };
  const { cleanup } = await mount(
    <AddressForm initial={initial} onCancel={vi.fn()} onSaved={vi.fn()} />,
  );

  // The saved address has coords, so GPS is not requested; a manual pin tap
  // geocodes — and must not clobber what the customer already saved.
  expect(loc.current.request).not.toHaveBeenCalled();
  act(() => map.events?.click({ latlng: { lat: 19.076, lng: 72.877 } }));
  await act(async () =>
    pending.resolve(geocodeReply({
      city: "Surat",
      postcode: "395001",
      state: "Gujarat",
      house_number: "12",
      road: "MG Road",
    })),
  );

  expect(field("address-line1").value).toBe("B-42, Sunshine Heights");
  expect(field("address-city").value).toBe("Ahmedabad");
  expect(field("address-pincode").value).toBe("380001");
  expect(field("address-state").value).toBe("Gujarat");

  await cleanup();
});

it("fills untouched fields from an auto GPS fix but protects a typed city", async () => {
  const pending = deferred<Response>();
  vi.stubGlobal("fetch", vi.fn(() => pending.promise));
  loc.current = {
    request: vi.fn(async () => ({ status: "granted" as const })),
    coords: { lat: 19.076, lng: 72.877 },
    status: "granted",
    isLoading: false,
  };
  const { cleanup } = await mount(
    <AddressForm onCancel={vi.fn()} onSaved={vi.fn()} />,
  );
  expect(vi.mocked(fetch)).toHaveBeenCalled(); // auto-fix requested a geocode

  await act(async () => typeInto(field("address-city"), "Mumbai"));
  await act(async () =>
    pending.resolve(geocodeReply({
      city: "Surat",
      postcode: "395001",
      state: "Gujarat",
      house_number: "12",
      road: "MG Road",
    })),
  );

  expect(field("address-city").value).toBe("Mumbai");
  expect(field("address-pincode").value).toBe("395001");
  expect(field("address-line1").value).toBe("12 MG Road");

  await cleanup();
});

it("keeps the form, the typed values and the route on a failed create", async () => {
  vi.mocked(addressRepository.create).mockResolvedValue({
    success: false,
    error: {
      code: "WRITE_FAILED",
      message: "We couldn't save your address. Please try again.",
      retryable: true,
    },
  } as never);
  const onSaved = vi.fn();
  const { cleanup } = await mount(
    <AddressForm onCancel={vi.fn()} onSaved={onSaved} />,
  );

  // A confirmed pin is required before submit can reach the repository.
  act(() => map.events?.click({ latlng: { lat: 19.076, lng: 72.877 } }));
  await act(async () => {
    typeInto(field("address-line1"), "Flat 9, Sea View Apartments");
    typeInto(field("address-city"), "Mumbai");
    typeInto(field("address-state"), "Maharashtra");
    typeInto(field("address-pincode"), "400050");
  });
  await submitForm();

  // Accessible, persistent error with the curated message.
  expect(document.querySelector('[role=alert]')?.textContent).toContain(
    "We couldn't save your address. Please try again.",
  );
  expect(toast.error).toHaveBeenCalledWith(
    "We couldn't save your address. Please try again.",
  );
  // No success claim and no navigation (the route navigates only onSaved).
  expect(toast.success).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
  // Nothing the customer typed is thrown away.
  expect(field("address-line1").value).toBe("Flat 9, Sea View Apartments");
  expect(field("address-city").value).toBe("Mumbai");
  expect(field("address-state").value).toBe("Maharashtra");
  expect(field("address-pincode").value).toBe("400050");

  await cleanup();
});

it("jumps the map instantly under prefers-reduced-motion instead of flying", async () => {
  Object.defineProperty(window, "matchMedia", {
    value: vi.fn(() => ({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
    configurable: true,
    writable: true,
  });
  const { cleanup } = await mount(
    <AddressForm onCancel={vi.fn()} onSaved={vi.fn()} />,
  );
  expect(map.setView).toHaveBeenCalled();
  expect(map.flyTo).not.toHaveBeenCalled();
  await cleanup();

  // Without the preference the animated flyTo stays the behavior.
  Reflect.deleteProperty(window, "matchMedia");
  await mount(<AddressForm onCancel={vi.fn()} onSaved={vi.fn()} />);
  expect(map.flyTo).toHaveBeenCalled();
});
