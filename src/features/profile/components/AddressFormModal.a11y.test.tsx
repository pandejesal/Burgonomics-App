/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AddressFormModal } from "./AddressFormModal";
import { addressRepository } from "@/features/addresses/repositories/AddressRepository";
import { toast } from "sonner";
import { GENERIC_ERROR_MESSAGE } from "@/core/errors/userMessages";

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
vi.mock("@/features/addresses/repositories/AddressRepository", () => ({
  addressRepository: { update: vi.fn(), create: vi.fn() },
}));
vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn(), selection: vi.fn(), notification: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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

const mounted: Array<{ root: Root; host: HTMLDivElement }> = [];

async function mount(ui: React.ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const entry = { root, host };
  mounted.push(entry);
  await act(async () => root.render(ui));
  return {
    root,
    rerender: async (next: React.ReactElement) => {
      await act(async () => root.render(next));
    },
    cleanup: async () => {
      const index = mounted.indexOf(entry);
      if (index === -1) return;
      mounted.splice(index, 1);
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

function openDialog() {
  // The sheet portals to document.body, outside its React mount host.
  const dialogs = document.querySelectorAll<HTMLElement>("[role=dialog]");
  return dialogs[dialogs.length - 1]!;
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

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  Reflect.deleteProperty(window, "matchMedia");
  for (const { root, host } of mounted.splice(0)) {
    await act(async () => root.unmount());
    host.remove();
  }
  document.body.innerHTML = "";
});

it("closes on Escape and stops listening once the sheet is gone", async () => {
  const close = vi.fn();
  const { cleanup } = await mount(<AddressFormModal isOpen onClose={close} />);

  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
  expect(close).toHaveBeenCalledTimes(1);

  await cleanup();
  // No keyboard trap after unmount: the listener is gone, not just inert.
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
  expect(close).toHaveBeenCalledTimes(1);
});

it("focuses the dialog on open and returns focus to the opener on close", async () => {
  // The opener lives outside the React root: React clears its own container
  // on first render, which would wipe a manually placed trigger button.
  const openerHost = document.createElement("div");
  const rootHost = document.createElement("div");
  document.body.append(openerHost, rootHost);
  const opener = document.createElement("button");
  opener.textContent = "Add new address";
  openerHost.append(opener);
  const root = createRoot(rootHost);
  const entry = { root, host: rootHost };
  mounted.push(entry);
  await act(async () => opener.focus());
  expect(document.activeElement).toBe(opener);

  await act(async () =>
    root.render(<AddressFormModal isOpen onClose={vi.fn()} />),
  );
  const dialog = openDialog();
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  expect(document.activeElement).toBe(dialog);

  await act(async () =>
    root.render(<AddressFormModal isOpen={false} onClose={vi.fn()} />),
  );
  expect(document.querySelector("[role=dialog]")).toBeNull();
  expect(document.activeElement).toBe(opener);

  mounted.splice(mounted.indexOf(entry), 1);
  await act(async () => root.unmount());
  openerHost.remove();
  rootHost.remove();
});

it("traps Tab inside the sheet and wraps at both ends", async () => {
  const { cleanup } = await mount(<AddressFormModal isOpen onClose={vi.fn()} />);
  const dialog = openDialog();
  const closeBtn = dialog.querySelector<HTMLButtonElement>('button[aria-label="Close modal"]')!;
  const save = dialog.querySelector<HTMLButtonElement>("button[type=submit]")!;

  // Forward Tab from the last control wraps to the first (close button).
  act(() => save.focus());
  const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
  act(() => document.dispatchEvent(tab));
  expect(tab.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(closeBtn);

  // Backward Tab from the first control wraps to the last (save).
  act(() => closeBtn.focus());
  const shiftTab = new KeyboardEvent("keydown", {
    key: "Tab",
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  });
  act(() => document.dispatchEvent(shiftTab));
  expect(shiftTab.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(save);

  await cleanup();
});

it("names the dialog by its heading and associates every field label with its input", async () => {
  const { cleanup } = await mount(<AddressFormModal isOpen onClose={vi.fn()} />);
  const dialog = openDialog();

  const labelId = dialog.getAttribute("aria-labelledby")!;
  expect(labelId).toBeTruthy();
  expect(document.getElementById(labelId)?.textContent).toBe("Add Delivery Address");

  for (const id of [
    "address-modal-line1",
    "address-modal-line2",
    "address-modal-landmark",
    "address-modal-pincode",
    "address-modal-city",
  ]) {
    expect(dialog.querySelector(`[id="${id}"]`)).not.toBeNull();
    const label = dialog.querySelector<HTMLElement>(`label[for="${id}"]`);
    expect(label, `label for ${id}`).not.toBeNull();
    expect(label!.textContent?.trim().length).toBeGreaterThan(0);
  }

  // Save As is a grouped control (fieldset/legend), not a stray label.
  const legend = dialog.querySelector("legend");
  expect(legend?.textContent).toContain("Save As");
  const toggles = dialog.querySelectorAll<HTMLButtonElement>('button[aria-pressed]');
  expect(toggles.length).toBe(3);
  expect(toggles[0].getAttribute("aria-pressed")).toBe("true");

  await cleanup();
});

it("starts city empty (no fake Mumbai), requires it on save, and keeps the pin requirement", async () => {
  const { cleanup } = await mount(<AddressFormModal isOpen onClose={vi.fn()} />);
  const dialog = openDialog();
  const line1 = dialog.querySelector<HTMLInputElement>("#address-modal-line1")!;
  const city = dialog.querySelector<HTMLInputElement>("#address-modal-city")!;
  const pincode = dialog.querySelector<HTMLInputElement>("#address-modal-pincode")!;
  const save = dialog.querySelector<HTMLButtonElement>("button[type=submit]")!;
  expect(city.value).toBe("");

  // line1 + pincode but no city → honest inline + toast validation, no save.
  await act(async () => {
    typeInto(line1, "B-42, Sunshine Heights");
    typeInto(pincode, "380001");
  });
  await act(async () => save.click());
  expect(dialog.querySelector('[role=alert]')?.textContent).toContain("Please enter your city");
  expect(toast.error).toHaveBeenCalledWith("Please enter your city");
  expect(addressRepository.create).not.toHaveBeenCalled();

  // City filled but no confirmed pin → pin requirement is unchanged.
  await act(async () => typeInto(city, "Ahmedabad"));
  await act(async () => save.click());
  expect(dialog.querySelector('[role=alert]')?.textContent).toContain("Locate Me");
  expect(addressRepository.create).not.toHaveBeenCalled();

  await cleanup();
});

it("saves the typed address once a pin is placed and reports repository failures in friendly copy", async () => {
  vi.mocked(addressRepository.create).mockResolvedValue({
    success: true,
    data: { id: "addr_new_1" },
  } as never);
  const close = vi.fn();
  const success = vi.fn();
  const { cleanup } = await mount(
    <AddressFormModal isOpen onClose={close} onSuccess={success} />,
  );
  const dialog = openDialog();
  const line1 = dialog.querySelector<HTMLInputElement>("#address-modal-line1")!;
  const city = dialog.querySelector<HTMLInputElement>("#address-modal-city")!;
  const pincode = dialog.querySelector<HTMLInputElement>("#address-modal-pincode")!;
  const save = dialog.querySelector<HTMLButtonElement>("button[type=submit]")!;

  await act(async () => {
    typeInto(line1, "  B-42, Sunshine Heights  ");
    typeInto(city, "Ahmedabad");
    typeInto(pincode, "380001");
  });
  // Confirm the pin via a map tap (mocked leaflet click handler).
  act(() => map.events?.click({ latlng: { lat: 19.076, lng: 72.877 } }));
  await act(async () => save.click());

  expect(addressRepository.create).toHaveBeenCalledWith({
    label: "home",
    customLabel: undefined,
    line1: "B-42, Sunshine Heights",
    line2: undefined,
    landmark: undefined,
    city: "Ahmedabad",
    pincode: "380001",
    lat: 19.076,
    lng: 72.877,
    isDefault: false,
  });
  expect(toast.success).toHaveBeenCalledWith("Address saved successfully");
  expect(success).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);

  // Auth/session failure surfaces friendly copy, never the raw server text.
  vi.mocked(addressRepository.create).mockResolvedValue({
    success: false,
    error: { code: "SESSION_EXPIRED", message: "raw Firebase auth/permission-denied text" },
  } as never);
  await act(async () => map.events?.click({ latlng: { lat: 19.08, lng: 72.88 } }));
  await act(async () => save.click());
  expect(toast.error).toHaveBeenCalledWith(
    "Your session expired. Please sign in again.",
  );

  // A thrown repository error releases the Saving… state instead of wedging.
  vi.mocked(addressRepository.create).mockRejectedValueOnce(new Error("offline"));
  await act(async () => map.events?.click({ latlng: { lat: 19.09, lng: 72.89 } }));
  await act(async () => save.click());
  expect(toast.error).toHaveBeenCalledWith(GENERIC_ERROR_MESSAGE);
  expect(save.disabled).toBe(false);
  expect(save.textContent).toBe("Save Address");

  await cleanup();
});

it("never overwrites fields the customer typed when an async pin geocode resolves", async () => {
  const pending = deferred<Response>();
  vi.stubGlobal("fetch", vi.fn(() => pending.promise));
  const { cleanup } = await mount(<AddressFormModal isOpen onClose={vi.fn()} />);
  const dialog = openDialog();
  const city = dialog.querySelector<HTMLInputElement>("#address-modal-city")!;
  const line1 = dialog.querySelector<HTMLInputElement>("#address-modal-line1")!;
  const pincode = dialog.querySelector<HTMLInputElement>("#address-modal-pincode")!;

  // Customer types their own city before the pin reply lands.
  await act(async () => typeInto(city, "Mumbai"));
  act(() => map.events?.click({ latlng: { lat: 19.076, lng: 72.877 } }));

  await act(async () =>
    pending.resolve(geocodeReply({
      city: "Surat",
      postcode: "395001",
      house_number: "12",
      road: "MG Road",
    })),
  );

  // Typed city wins; untouched fields still get filled from the reply.
  expect(city.value).toBe("Mumbai");
  expect(line1.value).toBe("12 MG Road");
  expect(pincode.value).toBe("395001");

  await cleanup();
});

it("drops a stale geocode reply when a newer pin was placed meanwhile", async () => {
  const first = deferred<Response>();
  const second = deferred<Response>();
  vi.stubGlobal("fetch", vi.fn(() => first.promise).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise));
  const { cleanup } = await mount(<AddressFormModal isOpen onClose={vi.fn()} />);
  const city = openDialog().querySelector<HTMLInputElement>("#address-modal-city")!;

  act(() => map.events?.click({ latlng: { lat: 23.0, lng: 72.6 } }));
  act(() => map.events?.click({ latlng: { lat: 22.3, lng: 70.8 } }));

  // Newer reply wins…
  await act(async () =>
    second.resolve(geocodeReply({ city: "Rajkot", postcode: "360001" })),
  );
  expect(city.value).toBe("Rajkot");
  // …and the older one, resolving later, is discarded by its token.
  await act(async () =>
    first.resolve(geocodeReply({ city: "Vadodara", postcode: "390001" })),
  );
  expect(city.value).toBe("Rajkot");

  await cleanup();
});

it("discards a geocode reply that resolves after the sheet closed and reopened", async () => {
  const pending = deferred<Response>();
  vi.stubGlobal("fetch", vi.fn(() => pending.promise));
  const { cleanup, rerender } = await mount(<AddressFormModal isOpen onClose={vi.fn()} />);
  const city = openDialog().querySelector<HTMLInputElement>("#address-modal-city")!;

  act(() => map.events?.click({ latlng: { lat: 19.076, lng: 72.877 } }));
  await rerender(<AddressFormModal isOpen={false} onClose={vi.fn()} />);
  await act(async () =>
    pending.resolve(geocodeReply({ city: "Surat", postcode: "395001" })),
  );
  // Reopen: the reset bumped the token, so the old reply stays dropped.
  await rerender(<AddressFormModal isOpen onClose={vi.fn()} />);
  const reopenedCity = openDialog().querySelector<HTMLInputElement>("#address-modal-city")!;
  expect(reopenedCity.value).toBe("");

  await cleanup();
});

it("keeps saved values of an edited address when a pin geocode resolves", async () => {
  const pending = deferred<Response>();
  vi.stubGlobal("fetch", vi.fn(() => pending.promise));
  const { cleanup } = await mount(
    <AddressFormModal
      isOpen
      onClose={vi.fn()}
      addressToEdit={{
        id: "addr_edit_1",
        label: "home",
        line1: "B-42, Sunshine Heights",
        city: "Ahmedabad",
        pincode: "380001",
        isDefault: false,
      }}
    />,
  );
  const dialog = openDialog();
  const city = dialog.querySelector<HTMLInputElement>("#address-modal-city")!;
  const line1 = dialog.querySelector<HTMLInputElement>("#address-modal-line1")!;
  const pincode = dialog.querySelector<HTMLInputElement>("#address-modal-pincode")!;

  // This address has no coords, so tapping the pin geocodes…
  act(() => map.events?.click({ latlng: { lat: 19.076, lng: 72.877 } }));
  await act(async () =>
    pending.resolve(geocodeReply({
      city: "Surat",
      postcode: "395001",
      house_number: "12",
      road: "MG Road",
    })),
  );
  // …but the loaded address fields are treated as typed and stay intact.
  expect(line1.value).toBe("B-42, Sunshine Heights");
  expect(city.value).toBe("Ahmedabad");
  expect(pincode.value).toBe("380001");

  await cleanup();
});

it("fills untouched fields from an auto GPS fix and still protects typed ones", async () => {
  const pending = deferred<Response>();
  vi.stubGlobal("fetch", vi.fn(() => pending.promise));
  loc.current = {
    request: vi.fn(async () => ({ status: "granted" as const })),
    coords: { lat: 19.076, lng: 72.877 },
    status: "granted",
    isLoading: false,
  };
  const { cleanup } = await mount(<AddressFormModal isOpen onClose={vi.fn()} />);
  const dialog = openDialog();
  const city = dialog.querySelector<HTMLInputElement>("#address-modal-city")!;
  const line1 = dialog.querySelector<HTMLInputElement>("#address-modal-line1")!;
  const pincode = dialog.querySelector<HTMLInputElement>("#address-modal-pincode")!;
  expect(pincode.value).toBe("");
  expect(vi.mocked(fetch)).toHaveBeenCalled(); // auto-fix requested a geocode

  await act(async () => typeInto(city, "Mumbai"));
  await act(async () =>
    pending.resolve(geocodeReply({
      city: "Surat",
      postcode: "395001",
      house_number: "12",
      road: "MG Road",
    })),
  );

  expect(city.value).toBe("Mumbai");
  expect(line1.value).toBe("12 MG Road");
  expect(pincode.value).toBe("395001");

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
  const { cleanup } = await mount(<AddressFormModal isOpen onClose={vi.fn()} />);
  expect(map.setView).toHaveBeenCalled();
  expect(map.flyTo).not.toHaveBeenCalled();
  await cleanup();

  // Without the preference the animated flyTo stays the behavior.
  Reflect.deleteProperty(window, "matchMedia");
  const { cleanup: cleanupPlain } = await mount(<AddressFormModal isOpen onClose={vi.fn()} />);
  expect(map.flyTo).toHaveBeenCalled();
  // Close it out: a leaked open sheet would shadow later tests' openDialog().
  await cleanupPlain();
});

it("does not treat an auto GPS fill as unsaved changes on close", async () => {
  const pending = deferred<Response>();
  vi.stubGlobal("fetch", vi.fn(() => pending.promise));
  loc.current = {
    request: vi.fn(async () => ({ status: "granted" as const })),
    coords: { lat: 19.076, lng: 72.877 },
    status: "granted",
    isLoading: false,
  };
  const close = vi.fn();
  const { cleanup } = await mount(<AddressFormModal isOpen onClose={close} />);
  await act(async () =>
    pending.resolve(
      geocodeReply({
        city: "Surat",
        postcode: "395001",
        house_number: "12",
        road: "MG Road",
      }),
    ),
  );
  const dialog = openDialog();
  // The sheet filled the fields (and the pin) by itself…
  expect(dialog.querySelector<HTMLInputElement>("#address-modal-city")!.value).toBe("Surat");
  expect(dialog.querySelector<HTMLInputElement>("#address-modal-line1")!.value).toBe("12 MG Road");

  // …so nothing was typed and Escape must still close without a prompt.
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
  expect(dialog.querySelector("[role=alertdialog]")).toBeNull();
  expect(close).toHaveBeenCalledTimes(1);

  await cleanup();
});
