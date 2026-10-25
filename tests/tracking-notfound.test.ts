// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Tracking subscription not-found handling.
 *
 * Until this suite, a `getTracking` answer of success-with-NO-data (deleted
 * doc, wrong id, or another account's order — the service's honest "no order
 * visible to this caller") fell through BOTH consumer branches in
 * OrderRepository.subscribeTracking: no listener call, no onError, poll
 * rescheduled — an infinite unseen poll with the UI stuck at the loading
 * state. Not-found is now a terminal subscription outcome.
 */

const onSnapshot = vi.fn();
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(),
  limit: vi.fn(() => ({})),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  onSnapshot: (...args: unknown[]) => onSnapshot(...args),
}));

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => []),
}));

vi.mock("firebase/auth", () => ({ getAuth: vi.fn() }));

vi.mock("../src/core/config/firebase", () => ({
  auth: { currentUser: null },
  db: {},
  firebaseApp: undefined,
}));

vi.mock("../src/core/logging/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { orderRepository } from "../src/features/orders/repositories/OrderRepository";
import type { OrderTrackingSnapshot } from "../src/features/orders/models";

const trackingSnap = (terminal: boolean): OrderTrackingSnapshot => ({
  orderId: "ord_1",
  status: { code: "ORDER_PLACED", label: "Order placed", kind: "upcoming", terminal },
  steps: [],
  etaMinutes: terminal ? 0 : 10,
  refreshedAt: new Date(0).toISOString(),
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("OrderRepository.subscribeTracking — not-found is terminal", () => {
  it("surfaces TRACKING_NOT_FOUND once and STOPS polling on success-without-data", async () => {
    vi.useFakeTimers();
    const service = (orderRepository as unknown as { service: { getTracking: unknown } })
      .service as { getTracking: ReturnType<typeof vi.fn> };
    const getTracking = vi.fn(async () => ({ success: true, data: null }));
    service.getTracking = getTracking;

    const listener = vi.fn();
    const onError = vi.fn();
    const sub = orderRepository.subscribeTracking("ord_missing", listener, {
      onError,
      intervalMs: 100,
    });

    await vi.advanceTimersByTimeAsync(0); // first fetchOnce
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatchObject({ code: "TRACKING_NOT_FOUND" });
    expect(listener).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400); // far past the interval: poll must NOT reschedule
    expect(onError).toHaveBeenCalledTimes(1); // exactly once — no infinite loop
    expect(getTracking).toHaveBeenCalledTimes(1); // one read, not one per interval

    sub.stop();
  });

  it("positive control: a real snapshot still reaches the listener and polls", async () => {
    vi.useFakeTimers();
    const service = (orderRepository as unknown as { service: { getTracking: unknown } })
      .service as { getTracking: ReturnType<typeof vi.fn> };
    const getTracking = vi.fn(async () => ({ success: true, data: trackingSnap(false) }));
    service.getTracking = getTracking;

    const listener = vi.fn();
    const onError = vi.fn();
    const sub = orderRepository.subscribeTracking("ord_live", listener, {
      onError,
      intervalMs: 100,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(250);
    // Rescheduled at ~100ms and ~200ms (third read); the 300ms read lies past this window.
    expect(listener).toHaveBeenCalledTimes(3);
    expect(onError).not.toHaveBeenCalled();

    sub.stop();
  });

  it("still stops after a terminal snapshot (existing behaviour preserved)", async () => {
    vi.useFakeTimers();
    const service = (orderRepository as unknown as { service: { getTracking: unknown } })
      .service as { getTracking: ReturnType<typeof vi.fn> };
    const getTracking = vi.fn(async () => ({ success: true, data: trackingSnap(true) }));
    service.getTracking = getTracking;

    const listener = vi.fn();
    const sub = orderRepository.subscribeTracking("ord_done", listener, { intervalMs: 100 });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(400);
    expect(listener).toHaveBeenCalledTimes(1); // terminal stops the poll

    sub.stop();
  });
});
