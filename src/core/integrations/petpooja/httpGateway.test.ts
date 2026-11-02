import { describe, it, expect, vi } from "vitest";

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
  it("creates live gateway when petpoojaEnabled=true", () => {
    expect(createPetpoojaGateway().implementation).toBe("live");
  });

  it("health read reports a connected bridge from the server's health route", async () => {
    const gw = new HttpPetpoojaGateway({
      functionsBaseUrl: "https://proxy.test/api",
      fetchImpl: okFetch({ status: "healthy" }),
    });
    expect(gw.implementation).toBe("live");
    const health = await gw.getHealth();
    expect(health.connected).toBe(true);
    expect(health.services.map((s) => s.service)).toContain("Petpooja POS API Bridge");
  });

  it("circuit breaker opens after the threshold and surfaces in metrics", async () => {
    const gw = new HttpPetpoojaGateway({
      functionsBaseUrl: "https://proxy.test/api",
      fetchImpl: failingFetch,
      breakerThreshold: 2,
      logWriteTimeoutMs: 50,
    });
    await gw.getStoreStatus("str_001");
    await gw.getStoreStatus("str_001");
    const metrics = await gw.getMetrics();
    expect(metrics.openBreakersCount).toBe(1);
    const health = await gw.getHealth();
    expect(health.connected).toBe(false);
  });

  it("reports an empty queue instead of an invented outbox depth", async () => {
    const gw = new HttpPetpoojaGateway({
      functionsBaseUrl: "https://proxy.test/api",
      fetchImpl: okFetch({}),
    });
    const queues = await gw.getQueues();
    expect(queues.waitingJobsCount).toBe(0);
    expect(queues.jobs).toEqual([]);
  });
});
