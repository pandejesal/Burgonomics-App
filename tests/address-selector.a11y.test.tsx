/** @vitest-environment jsdom */
/**
 * F1 (P1 a11y) — checkout address cards must be real selectable controls.
 *
 * Pre-fix each card was a `<div onClick>` with no role, tabIndex or key
 * handler: keyboard and AT users could not choose an address at all. These
 * tests fail against the pre-fix source (no [role=radiogroup]/[role=radio])
 * and pin: radiogroup semantics, aria-checked reflecting selection,
 * focusability, and Enter/Space selecting the focused card.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search: _search,
    className,
    children,
    ...rest
  }: {
    to: string;
    search?: Record<string, string>;
    className?: string;
    children?: React.ReactNode;
  }) => (
    <a href={String(to)} className={className} {...rest}>
      {children}
    </a>
  ),
}));

import { AddressSelector } from "../src/features/checkout/components/AddressSelector";
import { HapticService } from "../src/core/services/haptics";
import type { Address } from "../src/features/addresses/models";
import type { Store } from "../src/features/stores/models/Store";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const mount = async (ui: React.ReactElement) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(ui));
};

afterEach(async () => {
  const mountedRoot = root;
  if (mountedRoot) await act(async () => mountedRoot.unmount());
  root = null;
  host = null;
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

const address = (over: Partial<Address> & Pick<Address, "id">): Address => ({
  label: "home",
  line1: "12 Test Street",
  city: "Ahmedabad",
  pincode: "380015",
  isDefault: false,
  ...over,
});

const HOME = address({ id: "addr_home", label: "home", line1: "12 Test Street" });
// No lat/lng → the card renders the "Pin on map" link (nested interactive).
const WORK = address({ id: "addr_work", label: "work", line1: "99 Office Road" });

const store = {
  id: "store_1",
  name: "Satellite Outlet",
  lat: 23.0225,
  lng: 72.5714,
  deliveryRadiusKm: 7,
} as unknown as Store;

const radios = () => Array.from(host!.querySelectorAll<HTMLElement>('[role="radio"]'));

const keydown = async (el: HTMLElement, key: string) => {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
};

describe("AddressSelector radio semantics + keyboard selection (F1)", () => {
  it("exposes a radiogroup with one focusable radio per address", async () => {
    await mount(
      <AddressSelector
        addresses={[HOME, WORK]}
        selectedAddress={HOME}
        activeStore={store}
        onSelectAddress={vi.fn()}
      />,
    );

    expect(host!.querySelector('[role="radiogroup"]')).not.toBeNull();
    const items = radios();
    expect(items).toHaveLength(2);
    for (const item of items) expect(item.getAttribute("tabindex")).toBe("0");
  });

  it("reflects selection through aria-checked", async () => {
    await mount(
      <AddressSelector
        addresses={[HOME, WORK]}
        selectedAddress={WORK}
        activeStore={store}
        onSelectAddress={vi.fn()}
      />,
    );

    const [homeRadio, workRadio] = radios();
    expect(homeRadio.getAttribute("aria-checked")).toBe("false");
    expect(workRadio.getAttribute("aria-checked")).toBe("true");
  });

  it("selects on Enter and on Space", async () => {
    const onSelect = vi.fn();
    const haptic = vi.spyOn(HapticService, "selection").mockResolvedValue();
    await mount(
      <AddressSelector
        addresses={[HOME, WORK]}
        selectedAddress={HOME}
        activeStore={store}
        onSelectAddress={onSelect}
      />,
    );

    const workRadio = radios()[1];
    await keydown(workRadio, "Enter");
    expect(onSelect).toHaveBeenCalledWith(WORK);

    onSelect.mockClear();
    await keydown(workRadio, " ");
    expect(onSelect).toHaveBeenCalledWith(WORK);
    expect(haptic).toHaveBeenCalled();
    haptic.mockRestore();
  });

  it("ignores keyless keys (arrows/Tab do not select)", async () => {
    const onSelect = vi.fn();
    await mount(
      <AddressSelector
        addresses={[HOME, WORK]}
        selectedAddress={HOME}
        activeStore={store}
        onSelectAddress={onSelect}
      />,
    );

    await keydown(radios()[1], "ArrowDown");
    await keydown(radios()[1], "Tab");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("does not select the card when Enter lands on a nested link", async () => {
    const onSelect = vi.fn();
    await mount(
      <AddressSelector
        addresses={[HOME, WORK]}
        selectedAddress={HOME}
        activeStore={store}
        onSelectAddress={onSelect}
      />,
    );

    const pinLink = radios()[1].querySelector("a");
    expect(pinLink).not.toBeNull();
    await keydown(pinLink as HTMLElement, "Enter");
    expect(onSelect).not.toHaveBeenCalled();
  });
});
