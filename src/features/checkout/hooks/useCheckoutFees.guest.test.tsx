/**
 * CUS-17 — a signed-out cart/checkout must not call the authenticated
 * `POST /checkout/fees` endpoint (staging saw a guaranteed 401). The hook is
 * the only caller; signing in is what unlocks the real quote.
 *
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => ({
  quote: vi.fn(async () => {}),
  authenticated: false,
}));

vi.mock("@/features/auth/state/authStore", () => ({
  useAuthStore: (select: (state: { user: unknown }) => unknown) =>
    select({ user: fixture.authenticated ? { id: "uid_1" } : null }),
  selectIsAuthenticated: () => fixture.authenticated,
}));

vi.mock("@/features/checkout/services/checkoutQuote", () => ({
  quoteCheckoutFees: fixture.quote,
}));

vi.mock("@/shared/hooks/useHydrated", () => ({ useHydrated: () => true }));

vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (select: (state: unknown) => unknown) =>
    select({ fulfillment: "takeaway", activeStore: { id: "demo" } }),
}));

vi.mock("@/features/addresses", () => ({
  useAddressStore: (select: (state: unknown) => unknown) => select({ addresses: [] }),
  selectSelectedAddress: () => null,
}));

import { useCheckoutFees } from "@/features/checkout/hooks/useCheckoutFees";

let container: HTMLDivElement;
let root: Root;

function Probe() {
  const { view } = useCheckoutFees();
  return <span data-testid="status">{view.status}</span>;
}

async function mount() {
  await act(async () => root.render(<Probe />));
  await act(async () => {});
}

beforeEach(() => {
  fixture.authenticated = false;
  fixture.quote.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("CUS-17 — checkout fees are gated on sign-in", () => {
  it("never requests a quote while signed out", async () => {
    await mount();

    expect(fixture.quote).not.toHaveBeenCalled();
    // No quote state is invented: the screen keeps its unknown-fee copy.
    expect(container.querySelector('[data-testid="status"]')?.textContent).not.toBe("ready");
  });

  it("requests exactly one quote once the customer is signed in", async () => {
    fixture.authenticated = true;
    await mount();

    expect(fixture.quote).toHaveBeenCalledTimes(1);
  });
});
