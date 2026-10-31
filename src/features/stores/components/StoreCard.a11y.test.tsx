/**
 * A11Y-L2 (WCAG 4.1.2 Name, Role, Value) — /stores icon-only controls.
 *
 * Each StoreCard renders two 32px icon buttons: "info" (already labelled) and
 * a chevron that was `aria-hidden` with no name at all. The chevron is a real
 * control (it selects the store), so it must have a name that says what it
 * does and for which store.
 */
/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn(async () => {}) },
}));

import { StoreCard } from "@/features/stores/components/StoreCard";
import type { Store } from "@/features/stores/models/Store";

const makeStore = (name: string, id: string): Store => ({
  id,
  name,
  address: "1 Test Road",
  city: "Surat",
  area: "Vesu",
  lat: 21.15,
  lng: 72.77,
  phone: "+919000000000",
  imageUrl: null,
  hours: { open: "11:00", close: "23:00" },
  isOpen: true,
  isBusy: false,
  isRecentlyOpened: false,
  supports: { delivery: true, takeaway: true, dineIn: true },
  etaMinutes: 25,
  deliveryFee: 0,
  distanceKm: 1.2,
  partnerBranchId: "branch_1",
});

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("A11Y-L2 — store card icon buttons have accessible names", () => {
  it("names every 32px icon-only button, including the store it acts on", async () => {
    const stores = Array.from({ length: 17 }, (_, i) =>
      makeStore(`Burgonomics ${i + 1}`, `store_${i + 1}`),
    );
    await act(async () =>
      root.render(
        <>
          {stores.map((store) => (
            <StoreCard
              key={store.id}
              store={store}
              fulfillment="delivery"
              onSelect={() => {}}
            />
          ))}
        </>,
      ),
    );

    const iconButtons = Array.from(container.querySelectorAll("button")).filter(
      (b) => b.classList.contains("h-8") && b.classList.contains("w-8"),
    );
    expect(iconButtons.length).toBe(17 * 2);

    const unnamed = iconButtons.filter(
      (b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim().length === 0,
    );
    expect(unnamed).toHaveLength(0);

    // The select chevron names its store rather than being a bare arrow.
    for (const store of stores) {
      expect(
        container.querySelector(`button[aria-label="Select ${store.name}"]`),
        `missing select label for ${store.name}`,
      ).not.toBeNull();
    }
  });
});
