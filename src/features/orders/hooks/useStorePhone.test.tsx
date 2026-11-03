/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { byId } = vi.hoisted(() => ({ byId: vi.fn() }));
vi.mock("@/features/stores/services/storesService", () => ({ storesService: { byId } }));

const { useStorePhone } = await import("./useStorePhone");

type OrderLike = Parameters<typeof useStorePhone>[0];

function Probe({ order }: { order: OrderLike }) {
  return <output>{useStorePhone(order) ?? "none"}</output>;
}

async function render(order: OrderLike) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<Probe order={order} />));
  return { host, root };
}

const snapshot = (phone: string) =>
  ({ store: { id: "demo", name: "Burgonomics DEMO", phone } }) as OrderLike;

beforeEach(() => {
  byId.mockReset();
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("useStorePhone", () => {
  it("uses the order's own snapshot without a lookup", async () => {
    const { host, root } = await render(snapshot("+919800000000"));
    expect(host.textContent).toBe("+919800000000");
    expect(byId).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it("falls back to the store directory when the snapshot is blank", async () => {
    byId.mockResolvedValue({ success: true, data: { phone: "+919811111111" } });
    const { host, root } = await render(snapshot(""));
    expect(byId).toHaveBeenCalledExactlyOnceWith("demo");
    expect(host.textContent).toBe("+919811111111");
    await act(async () => root.unmount());
  });

  it("stays unavailable when neither source has a number, never a default", async () => {
    byId.mockResolvedValue({ success: true, data: { phone: "" } });
    const { host, root } = await render(snapshot(""));
    expect(host.textContent).toBe("none");
    await act(async () => root.unmount());
  });

  it("stays unavailable when the lookup fails", async () => {
    byId.mockRejectedValue(new Error("offline"));
    const { host, root } = await render(snapshot(""));
    expect(host.textContent).toBe("none");
    await act(async () => root.unmount());
  });

  it("does nothing while the order has not loaded", async () => {
    const { host, root } = await render(null);
    expect(byId).not.toHaveBeenCalled();
    expect(host.textContent).toBe("none");
    await act(async () => root.unmount());
  });
});
