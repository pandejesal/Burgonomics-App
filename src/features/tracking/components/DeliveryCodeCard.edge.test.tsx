/**
 * Edge cases for the delivery-code card that the main suite does not pin:
 *  - an in-app account switch must fetch the NEW owner's code with the new uid
 *    (and switching back must not resurrect the previous owner's code),
 *  - the route order id changing without unmounting must drop the old code and
 *    must not issue a request for a mismatched order,
 *  - retry must enter a fresh loading state (no stale digits) and issue exactly
 *    one request per press,
 *  - a rejection that lands after unmount must not touch state,
 *  - the retry budget belongs to the (uid, orderId) scope, not the module.
 */
/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "@/features/orders/models";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const request = vi.hoisted(() => vi.fn());
vi.mock("../services/deliveryCodeService", () => ({ retrieveDeliveryCode: request }));
vi.mock("@/features/auth/state/authStore", async () => {
  const { create } = await import("zustand");
  return {
    useAuthStore: create(() => ({ status: "authenticated", accessToken: "fixture", user: { id: "owner-a", phone: "+910000000001" } })),
    selectIsAuthenticated: (s: { status: string; accessToken: string | null; user: { id: string; phone: string } | null }) =>
      s.status === "authenticated" && !!s.accessToken && !!s.user?.id && !!s.user?.phone,
  };
});
import { useAuthStore } from "@/features/auth/state/authStore";
import { DeliveryCodeCard } from "./DeliveryCodeCard";

const order = (overrides: Partial<Order> = {}): Order =>
  ({
    id: "order-a",
    shortCode: "BG-A",
    fulfillment: "delivery",
    status: { code: "PREPARING", label: "Preparing", kind: "in_progress", terminal: false },
    payment: { status: "paid", method: "online", label: "Paid" },
    // Real server shape for a v2 order: the version is what makes the code
    // reopenable, so a fixture without it is a legacy order and must not render.
    deliveryOtpVersion: 2,
    ...overrides,
  }) as Order;
const success = (orderId = "order-a", deliveryOtp = "4826") => ({
  success: true as const,
  data: { orderId, deliveryOtp, version: 2 as const },
});
const retryableFailure = {
  success: false as const,
  error: { code: "DELIVERY_CODE_UNAVAILABLE", message: "fixture", retryable: true },
};
function deferred<T = ReturnType<typeof success>>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const user = (id: string) => ({ id, phone: id === "owner-a" ? "+910000000001" : "+910000000002" });
let container: HTMLDivElement;
let root: Root;
let mounted: boolean;
async function render(value = order(), orderId = value.id) {
  await act(async () => root.render(<DeliveryCodeCard order={value} orderId={orderId} />));
}
const code = () => container.querySelector("[data-sensitive=delivery-code]")?.textContent;
async function clickRetry() {
  const button = container.querySelector<HTMLButtonElement>("button");
  expect(button?.textContent).toContain("Retry");
  await act(async () => button!.click());
}
beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ status: "authenticated", accessToken: "fixture", user: user("owner-a") });
  request.mockResolvedValue(success());
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mounted = true;
});
afterEach(async () => {
  if (mounted) await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("delivery-code card identity and route scope", () => {
  it("requests the new account's own code after an in-app owner switch, and never revives the old one", async () => {
    const first = deferred();
    const second = deferred();
    const third = deferred();
    request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValue(third.promise);

    await render();
    await act(async () => first.resolve(success()));
    expect(code()).toBe("4826");
    expect(request.mock.calls[0][1]).toBe("owner-a");

    await act(async () => useAuthStore.setState({ user: user("owner-b") }));
    // The child is re-keyed, so the previous owner's code is gone immediately.
    expect(code()).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toBe("order-a");
    expect(request.mock.calls[1][1]).toBe("owner-b");
    // The previous owner's late response is aborted and cannot land here.
    expect((request.mock.calls[0][2] as AbortSignal).aborted).toBe(true);
    await act(async () => first.resolve(success("order-a", "1111")));
    expect(code()).toBeUndefined();

    await act(async () => second.resolve(success("order-a", "7351")));
    expect(code()).toBe("7351");

    await act(async () => useAuthStore.setState({ user: user("owner-a") }));
    expect(code()).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[2][1]).toBe("owner-a");
    await act(async () => third.resolve(success("order-a", "2468")));
    expect(code()).toBe("2468");
    expect(container.textContent).not.toContain("7351");
  });

  it("drops the rendered code when the route order id changes without unmounting", async () => {
    request
      .mockResolvedValueOnce(success("order-a", "4826"))
      .mockResolvedValueOnce(success("order-b", "8642"));

    await render();
    expect(code()).toBe("4826");

    // Route id moved on, but the loaded order still belongs to the old id:
    // nothing may render and no request may be sent for the mismatch.
    await act(async () => root.render(<DeliveryCodeCard order={order()} orderId="order-b" />));
    expect(container.innerHTML).toBe("");
    expect(request).toHaveBeenCalledTimes(1);

    await act(async () => root.render(<DeliveryCodeCard order={order({ id: "order-b" })} orderId="order-b" />));
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toBe("order-b");
    expect(code()).toBe("8642");
  });

  it("keeps the retry budget scoped to the order, not the module", async () => {
    request.mockResolvedValue(retryableFailure);
    await render();
    await clickRetry();
    await clickRetry();
    expect(request).toHaveBeenCalledTimes(3);
    expect(container.querySelector("button")).toBeNull();

    await act(async () => root.render(<DeliveryCodeCard order={order({ id: "order-b" })} orderId="order-b" />));
    expect(request).toHaveBeenCalledTimes(4);
    expect(request.mock.calls[3][0]).toBe("order-b");
    expect(container.querySelector("button")?.textContent).toContain("Retry");
  });
});

describe("delivery-code card retry and unmount boundaries", () => {
  it("enters a fresh loading state on retry and issues exactly one request per press", async () => {
    const retried = deferred();
    request.mockResolvedValueOnce(retryableFailure).mockReturnValueOnce(retried.promise);

    await render();
    expect(container.querySelector("[role=alert]")).not.toBeNull();

    await clickRetry();
    // One press = one request (the handler's state change must not double-fetch).
    expect(request).toHaveBeenCalledTimes(2);
    expect(container.querySelector("[data-sensitive]")).toBeNull();
    expect(container.querySelector("[role=status]")?.textContent).toContain("Loading delivery code");
    expect(container.querySelector("[role=alert]")).toBeNull();

    await act(async () => retried.resolve(success()));
    expect(code()).toBe("4826");
  });

  it("swallows a rejection that lands after unmount without touching state or logging", async () => {
    const pending = deferred();
    request.mockReturnValue(pending.promise);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await render();
    const signal = request.mock.calls[0][2] as AbortSignal;
    await act(async () => root.unmount());
    mounted = false;
    expect(signal.aborted).toBe(true);

    await act(async () => pending.reject({ status: 500 }));
    expect(container.innerHTML).toBe("");
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
