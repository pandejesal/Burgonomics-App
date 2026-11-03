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
    selectIsAuthenticated: (s: { status: string; accessToken: string | null; user: { id: string; phone: string } | null }) => s.status === "authenticated" && !!s.accessToken && !!s.user?.id && !!s.user?.phone,
  };
});
import { useAuthStore } from "@/features/auth/state/authStore";
import { DeliveryCodeCard } from "./DeliveryCodeCard";

const order = (overrides: Partial<Order> = {}): Order => ({
  id: "order-a",
  shortCode: "BG-A",
  fulfillment: "delivery",
  status: { code: "PREPARING", label: "Preparing", kind: "in_progress", terminal: false },
  payment: { status: "paid", method: "online", label: "Paid" },
  ...overrides,
} as Order);
const success = (orderId = "order-a", deliveryOtp = "4826") => ({ success: true, data: { orderId, deliveryOtp, version: 2 } });
function deferred() {
  let resolve!: (value: ReturnType<typeof success>) => void;
  return { promise: new Promise<ReturnType<typeof success>>((r) => { resolve = r; }), resolve: (value: ReturnType<typeof success>) => resolve(value) };
}
let container: HTMLDivElement;
let root: Root;
let mounted: boolean;
async function render(value = order(), orderId = value.id) {
  await act(async () => root.render(<DeliveryCodeCard order={value} orderId={orderId} />));
}
const code = () => container.querySelector("[data-sensitive=delivery-code]")?.textContent;
async function retry() {
  const button = container.querySelector<HTMLButtonElement>("button");
  expect(button?.textContent).toContain("Retry");
  await act(async () => button!.click());
}
beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ status: "authenticated", accessToken: "fixture", user: { id: "owner-a", phone: "+910000000001" } });
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

describe("delivery handover code in component memory only", () => {
  it("shows loading with no dummy digits, then the genuine owner code and arrival warning", async () => {
    const pending = deferred();
    request.mockReturnValue(pending.promise);
    const storage = vi.spyOn(Storage.prototype, "setItem");
    await render();
    expect(container.textContent).toContain("Loading delivery code");
    expect(container.textContent).not.toContain("0000");
    expect(code()).toBeUndefined();
    expect(request).toHaveBeenCalledWith("order-a", "owner-a", expect.any(AbortSignal));
    await act(async () => pending.resolve(success()));
    expect(code()).toBe("4826");
    expect(container.textContent).toContain("Only share this code when your food arrives");
    expect(storage).not.toHaveBeenCalled();
  });

  it("reopens by fetching fresh after an unmount/restart, never from a persistent code cache", async () => {
    await render();
    expect(code()).toBe("4826");
    await act(async () => root.unmount());
    expect(code()).toBeUndefined();
    root = createRoot(container);
    request.mockResolvedValue(success("order-a", "7351"));
    await render();
    expect(request).toHaveBeenCalledTimes(2);
    expect(code()).toBe("7351");
  });

  it("has a 44px retry target and a bounded explicit retry, not an automatic poll", async () => {
    request.mockResolvedValue({ success: false, error: { code: "DELIVERY_CODE_UNAVAILABLE", retryable: true } });
    await render();
    const button = container.querySelector("button");
    expect(button?.className).toContain("min-h-11");
    await render(order());
    expect(request).toHaveBeenCalledTimes(1);
    await retry();
    await retry();
    expect(request).toHaveBeenCalledTimes(3);
    expect(container.querySelector("button")).toBeNull();
    expect(code()).toBeUndefined();
  });

  it("can recover from a transient error on explicit retry", async () => {
    request.mockResolvedValueOnce({ success: false, error: { code: "DELIVERY_CODE_UNAVAILABLE", retryable: true } });
    await render();
    await retry();
    expect(code()).toBe("4826");
  });

  it.each(["LEGACY_OTP_UNAVAILABLE", "AUTH_CHANGED", "ORDER_NOT_ELIGIBLE"])("stops on %s without leaking a cached verify code", async (code) => {
    request.mockResolvedValue({ success: false, error: { code, retryable: false } });
    await render(order({ meta: { deliveryOtp: "1111" } }));
    expect(container.querySelector("[data-sensitive]")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    if (code === "LEGACY_OTP_UNAVAILABLE") expect(container.textContent).toContain("older order");
    await render(order({ status: { code: "OUT_FOR_DELIVERY", label: "On the way", kind: "in_progress", terminal: false } }));
    expect(request).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("1111");
  });

  it.each([
    { fulfillment: "takeaway" }, { fulfillment: "dinein" },
    { payment: { status: "pending" } }, { payment: { status: "refunded" } },
    { payment: { status: "CASH_PENDING" } }, { payment: { status: "completed" } },
    { status: { code: "DELIVERED", terminal: true } },
    { status: { code: "CANCELLED", terminal: false } },
    { status: { code: "REFUNDING", terminal: false } },
    { status: { code: "FAILED", terminal: true } },
    { status: { code: "FUTURE_UNKNOWN", terminal: false } },
    { deliveryOtpConsumedAt: "fixture-time" },
    { refundStatus: "pending" }, { refundStatus: "refunded" },
    { payment: { status: "paid", refundStatus: "initiated" } },
    { refundActiveClaim: "fixture-claim" }, { refundClaimedAt: "fixture-time" },
    { reconciliation: { state: "payment_review" } },
  ])("does not request or expose an ineligible order: %j", async (overrides) => {
    await render(order(overrides as Partial<Order>));
    expect(container.textContent).toBe("");
    expect(request).not.toHaveBeenCalled();
  });

  it("never requests when the loaded order does not match the route order id", async () => {
    await render(order(), "other-order");
    expect(container.textContent).toBe("");
    expect(request).not.toHaveBeenCalled();
  });

  it.each(["logout", "account", "order", "terminal", "refund", "unpaid", "consumed"])("hides the previous code immediately on %s", async (change) => {
    const first = deferred();
    const next = deferred();
    request.mockReturnValueOnce(first.promise).mockReturnValue(next.promise);
    await render();
    await act(async () => first.resolve(success()));
    expect(code()).toBe("4826");
    if (change === "logout" || change === "account") {
      await act(async () => useAuthStore.setState(change === "logout" ? { status: "guest", user: null, accessToken: null } : { user: { id: "owner-b", phone: "+910000000002" } }));
    } else {
      const updates: Record<string, Partial<Order>> = {
        order: { id: "order-b" }, terminal: { status: { code: "DELIVERED", terminal: true, kind: "completed", label: "Delivered" } },
        refund: { payment: { status: "refunded", method: "online", label: "Refunded" } },
        unpaid: { payment: { status: "pending", method: "online", label: "Pending" } },
        consumed: { deliveryOtpConsumedAt: "fixture-time" },
      };
      await render(order(updates[change]));
    }
    expect(code()).toBeUndefined();
    // The new scope may receive its OWN fresh response, never the old scope's
    // state. The separate pending-response tests below cover orphaned requests.
    await act(async () => next.resolve(success(change === "order" ? "order-b" : "order-a", "7351")));
    expect(container.textContent).not.toContain("4826");
  });

  it("discards pending owner A responses after switching to owner B on the same order", async () => {
    const old = deferred();
    const current = deferred();
    request.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    await render();
    const oldSignal = request.mock.calls[0][2] as AbortSignal;
    await act(async () => useAuthStore.setState({ user: { id: "owner-b", phone: "+910000000002" } }));
    expect(oldSignal.aborted).toBe(true);
    await act(async () => old.resolve(success()));
    expect(code()).toBeUndefined();
    await act(async () => current.resolve(success("order-a", "7351")));
    expect(code()).toBe("7351");
  });

  it("aborts and ignores a late promise after unmount", async () => {
    const pending = deferred();
    request.mockReturnValue(pending.promise);
    await render();
    const signal = request.mock.calls[0][2] as AbortSignal;
    await act(async () => root.unmount());
    mounted = false;
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(success()));
    expect(container.textContent).toBe("");
  });

  it("begins retrieval when a confirmed live payment changes from pending to normalized paid", async () => {
    await render(order({ payment: { status: "pending", method: "online", label: "Pending" } }));
    expect(request).not.toHaveBeenCalled();
    await render(order());
    expect(code()).toBe("4826");
    await render(order());
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("announces code with spaced digits in aria-label and matches section landmark aria-label to visible h2", async () => {
    request.mockResolvedValue(success("order-a", "1234"));
    await render();

    const section = container.querySelector("section");
    const heading = container.querySelector("h2");
    expect(section).not.toBeNull();
    expect(heading).not.toBeNull();
    expect(section?.getAttribute("aria-label")).toBe("Delivery code");
    expect(heading?.textContent).toBe("Delivery code");
    expect(section?.getAttribute("aria-label")).toBe(heading?.textContent);

    const codeEl = container.querySelector("[data-sensitive=delivery-code]");
    expect(codeEl).not.toBeNull();
    expect(codeEl?.textContent).toBe("1234");
    expect(codeEl?.getAttribute("aria-label")).toBe("Delivery handover code: 1 2 3 4");
  });

  it("enables text selection on the code element via select-text class to allow copying", async () => {
    await render();
    const codeEl = container.querySelector("[data-sensitive=delivery-code]");
    expect(codeEl).not.toBeNull();
    expect(codeEl?.classList.contains("select-text")).toBe(true);
    expect(codeEl?.className).toContain("select-text");
  });

  it("uses role=status while loading, role=alert on error, and carries focus-visible ring classes on retry button", async () => {
    const pending = deferred();
    request.mockReturnValue(pending.promise);
    await render();

    const loadingEl = container.querySelector("[role=status]");
    expect(loadingEl).not.toBeNull();
    expect(loadingEl?.textContent).toContain("Loading delivery code");
    expect(container.querySelector("[role=alert]")).toBeNull();

    request.mockResolvedValue({ success: false, error: { code: "DELIVERY_CODE_UNAVAILABLE", retryable: true } });
    await render(order({ id: "order-error" }), "order-error");

    const alertEl = container.querySelector("[role=alert]");
    expect(alertEl).not.toBeNull();
    expect(alertEl?.textContent).toContain("We couldn't load the delivery code");
    expect(container.querySelector("[role=status]")).toBeNull();

    const button = container.querySelector<HTMLButtonElement>("button");
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain("Retry delivery code");
    expect(button?.classList.contains("focus-visible:ring-2")).toBe(true);
    expect(button?.classList.contains("focus-visible:ring-ring")).toBe(true);
    expect(button?.classList.contains("focus-visible:ring-offset-2")).toBe(true);
    expect(button?.classList.contains("focus-visible:ring-offset-surface")).toBe(true);
    expect(button?.classList.contains("focus-visible:outline-none")).toBe(true);
  });

  it("safely renders nothing without throwing when order payment is undefined mid-transition", async () => {
    await expect(render(order({ payment: undefined }))).resolves.not.toThrow();
    expect(container.textContent).toBe("");
    expect(container.innerHTML).toBe("");
    expect(container.querySelector("section")).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});
