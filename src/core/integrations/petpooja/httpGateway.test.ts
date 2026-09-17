import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock appConfig to return petpoojaEnabled: true so the gateway factory
// loads the live gateway instead of throwing. This must be hoisted so
// it runs before the gateway module is evaluated.
vi.mock("@/core/config/env", () => ({
  appConfig: {
    env: "development",
    appName: "Burgonomics",
    appVersion: "1.0.0",
    api: { baseUrl: "https://test", timeoutMs: 15000, retry: { attempts: 2, backoffMs: 500 } },
    featureFlags: { offlineMode: false, orderTracking: true, referrals: false, adminOps: true },
    analytics: { enabled: false, writeKey: "" },
    push: { enabled: true, vapidPublicKey: "" },
    integrations: {
      razorpayKeyId: "",
      paymentsApiBaseUrl: "https://test",
      petpoojaEnabled: true,
      mapsApiKey: "",
      firebaseConfig: "",
    },
  },
  isDev: () => true,
  isProd: () => false,
}));

import { HttpPetpoojaGateway } from "./httpGateway";
import { createPetpoojaGateway } from "./gateway";

const okFetch = (body: unknown = {}) =>
  (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

const failingFetch = ((_url: unknown, _init: unknown) => {
  throw new Error("proxy down");
}) as typeof fetch;

describe("petpooja gateway wiring", () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      // non-DOM env — outbox storage is guarded
    }
  });

  it("creates live gateway when petpoojaEnabled=true", () => {
    expect(createPetpoojaGateway().implementation).toBe("live");
  });

  it("live pushOrder acknowledges via the proxy contract", async () => {
    const gw = new HttpPetpoojaGateway({
      functionsBaseUrl: "https://proxy.test/api",
      fetchImpl: okFetch({ success: true, kotNumber: "KOT-123" }),
      outboxKey: "test.outbox.ok",
    });
    expect(gw.implementation).toBe("live");
    const res = await gw.pushOrder("ord_1", {
      id: "ord_1",
      items: [],
      store: { id: "str_001", name: "S", address: "A" },
      totals: {},
      payment: { method: "upi" },
      address: { phone: "+91 98765 43210" },
    } as any);
    expect(res.acknowledged).toBe(true);
    expect(res.kotNumber).toBe("KOT-123");
    // no secrets leave the browser
    expect(res.payload.app_key).toBe("");
    expect(res.payload.app_secret).toBe("");
  });

  it("failed pushOrder is queued, visible, and replayable", async () => {
    const gw = new HttpPetpoojaGateway({
      functionsBaseUrl: "https://proxy.test/api",
      fetchImpl: failingFetch,
      outboxKey: "test.outbox.fail",
      breakerThreshold: 100,
    });
    const res = await gw.pushOrder("ord_9", {
      id: "ord_9",
      items: [],
      store: { id: "str_001", name: "S", address: "A" },
      totals: {},
      payment: { method: "upi" },
      address: { phone: "+91 98765 43210" },
    } as any);
    expect(res.acknowledged).toBe(false);

    const queues = await gw.getQueues();
    expect(queues.waitingJobsCount).toBe(1);

    // proxy recovers → replay drains the outbox
    (gw as unknown as { fetchImpl: typeof fetch }).fetchImpl = okFetch({
      success: true,
      kotNumber: "KOT-9",
    });
    const replay = await gw.replayWebhook("any");
    expect(replay.acknowledged).toBe(true);
    expect((await gw.getQueues()).waitingJobsCount).toBe(0);
  });

  it("refuses to push without a customer phone instead of inventing one", async () => {
    const gw = new HttpPetpoojaGateway({
      functionsBaseUrl: "https://proxy.test/api",
      fetchImpl: okFetch({ success: true }),
      outboxKey: "test.outbox.nophone",
    });
    await expect(
      gw.pushOrder("ord_x", {
        id: "ord_x",
        items: [],
        store: { id: "str_001", name: "S", address: "A" },
        totals: {},
        payment: { method: "upi" },
      } as any)
    ).rejects.toThrow("Customer phone is required");
  });

  it("circuit breaker opens after the threshold and surfaces in metrics", async () => {
    const gw = new HttpPetpoojaGateway({
      functionsBaseUrl: "https://proxy.test/api",
      fetchImpl: failingFetch,
      outboxKey: "test.outbox.breaker",
      breakerThreshold: 2,
      logWriteTimeoutMs: 50,
    });
    await gw.pushMenu("str_001");
    await gw.pushMenu("str_001");
    const metrics = await gw.getMetrics();
    expect(metrics.openBreakersCount).toBe(1);
    expect(metrics.simulated).toBe(false);
    const health = await gw.getHealth();
    expect(health.connected).toBe(false);
  });
});