/**
 * Item 2 (api-contract-audit): the customer bundle must not call staff-only
 * Petpooja routes. `/petpooja/syncMenu` requires manager/owner staff roles and
 * `/petpooja/stores` does not exist at all (404) — both were swallowed into
 * empty/zero results. Neither has a caller in this app, so the capability is
 * removed rather than left as a 403/404 generator.
 *
 * The remaining diagnostic reads (health, logs, breakers) stay, and must keep
 * talking to real routes only.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/core/config/firebase", () => ({
  auth: { currentUser: null },
  db: {},
  getAppCheckToken: async () => null,
}));

import { HttpPetpoojaGateway } from "../src/core/integrations/petpooja/httpGateway";

function recordingFetch(body: unknown = { status: "healthy" }) {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(String(url));
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("customer Petpooja gateway exposes no staff-only route", () => {
  it("has no syncMenu / stores / pushOrder surface at all", () => {
    const gw = new HttpPetpoojaGateway({
      functionsBaseUrl: "https://proxy.test/api",
      fetchImpl: recordingFetch().impl,
    }) as unknown as Record<string, unknown>;

    expect(gw.pushOrder).toBeUndefined();
    expect(gw.pushMenu).toBeUndefined();
    expect(gw.getStores).toBeUndefined();
  });

  it("its remaining reads only touch routes the server actually serves", async () => {
    const { impl, calls } = recordingFetch();
    const gw = new HttpPetpoojaGateway({
      functionsBaseUrl: "https://proxy.test/api",
      fetchImpl: impl,
    });

    await gw.getHealth();

    expect(calls.length).toBeGreaterThan(0);
    for (const url of calls) {
      expect(url).not.toContain("/petpooja/syncMenu");
      expect(url).not.toContain("/petpooja/stores");
      expect(url).not.toContain("/petpooja/pushOrder");
    }
  });
});
