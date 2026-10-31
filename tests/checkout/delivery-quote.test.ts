/**
 * R8 client contract — server delivery + packaging fees, no static fare.
 *
 * Covers the state machine that the checkout and payment screens share:
 *  - an address change during an in-flight quote never applies the old fare;
 *  - expiry turns a quote unusable (re-quote required);
 *  - unserviceable and provider-outage states disable PAY and never print a
 *    static ₹35/₹40 fee;
 *  - takeaway never asks the courier for a quote and still gets packaging;
 *  - cash on delivery is gated by exactly the same quote states.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkoutFeesKey,
  buildCheckoutFeesContext,
  isCheckoutFeesExpired,
  isCheckoutFeesUsable,
  nextRequoteDelay,
  type CheckoutFeesState,
} from "../../src/features/checkout/state/checkoutFeesTypes";
import {
  checkoutFeesUrl,
  parseCheckoutFees,
  requestCheckoutFees,
  type CheckoutFeesTransport,
} from "../../src/features/checkout/services/deliveryQuoteService";
import { defaultFunctionsBase } from "../../src/core/config/functionsBase";
import { quoteCheckoutFees } from "../../src/features/checkout/services/checkoutQuote";
import { deliveryQuoteView } from "../../src/features/checkout/utils/deliveryQuoteView";
import { mapTransportError, httpClient } from "../../src/core/network/httpClient";
import { useCheckoutStore } from "../../src/features/checkout/state/checkoutStore";
import { cartRepository } from "../../src/features/cart/repositories/CartRepository";
import { useCartStore } from "../../src/features/cart/state/cartStore";
import { useStoreSelection } from "../../src/features/stores/state/storeStore";
import type { Store } from "../../src/features/stores/models/Store";

const STORE = {
  id: "demo",
  name: "Burgonomics DEMO",
  lat: 23.0225,
  lng: 72.5714,
  isOpen: true,
  supports: { delivery: true, takeaway: true, dineIn: true },
} as unknown as Store;

const deliveryResponse = (fee: number, quoteId: string, expiresInMs = 120_000) => ({
  serviceable: true,
  packagingFee: 15,
  deliveryFee: fee,
  deliveryQuoteId: quoteId,
  provider: "borzo",
  expiresAt: Date.now() + expiresInMs,
});

function transportReturning(data: unknown): {
  transport: CheckoutFeesTransport;
  calls: Array<{
    url: string;
    body: Record<string, unknown>;
    headers?: Record<string, string>;
  }>;
} {
  const calls: Array<{
    url: string;
    body: Record<string, unknown>;
    headers?: Record<string, string>;
  }> = [];
  return {
    calls,
    transport: {
      post: async (url, body, init) => {
        calls.push({
          url,
          body: body as Record<string, unknown>,
          headers: init?.headers,
        });
        return { data };
      },
    },
  };
}

/** Deterministic auth: no Firebase import in these tests. */
const NO_TOKENS = {
  idToken: async () => null,
  appCheckToken: async () => null,
};

beforeEach(() => {
  useCheckoutStore.setState({
    checkoutFees: { status: "idle" },
    feesRequestSeq: 0,
    feesKey: null,
  });
  useCartStore.setState({
    lines: [
      {
        lineId: "l1",
        productId: "p1",
        name: "Burger",
        storeId: STORE.id,
        quantity: 1,
        unitPrice: 300,
        price: 300,
        availability: "available",
        modifiers: [],
      },
    ],
    storeId: STORE.id,
    promo: null,
    status: "ready",
  });
  useStoreSelection.setState({ activeStore: STORE, fulfillment: "delivery" });
});

describe("POST /checkout/fees request", () => {
  it("posts the canonical body for delivery, with the drop pins", async () => {
    const { transport, calls } = transportReturning(deliveryResponse(57, "q_del_1"));
    const res = await requestCheckoutFees(
      buildCheckoutFeesContext({
        storeId: "demo",
        branchId: "br_1",
        orderType: "delivery",
        dropLat: 23.03,
        dropLng: 72.58,
      }),
      { transport, ...NO_TOKENS },
    );

    expect(calls[0].url).toBe(checkoutFeesUrl());
    expect(calls[0].body).toEqual({
      orderType: "delivery",
      storeId: "demo",
      branchId: "br_1",
      dropLat: 23.03,
      dropLng: 72.58,
    });
    expect(res.success).toBe(true);
    if (!res.success || !res.data.serviceable) return;
    expect(res.data.deliveryFee).toBe(57);
    expect(res.data.packagingFee).toBe(15);
    expect(res.data.deliveryQuoteId).toBe("q_del_1");
  });

  it("never asks the courier for a takeaway quote and still returns packaging", async () => {
    const { transport, calls } = transportReturning({
      serviceable: true,
      packagingFee: 15,
      deliveryFee: 0,
    });
    const res = await requestCheckoutFees(
      buildCheckoutFeesContext({ storeId: "demo", orderType: "takeaway", dropLat: 23.03, dropLng: 72.58 }),
      { transport, ...NO_TOKENS },
    );

    // No pins are sent, so the server cannot fan out to a carrier.
    expect(calls[0].body).toEqual({ orderType: "takeaway", storeId: "demo" });
    expect(calls[0].body.dropLat).toBeUndefined();
    expect(calls[0].body.dropLng).toBeUndefined();
    expect(res.success).toBe(true);
    if (!res.success || !res.data.serviceable) return;
    expect(res.data.deliveryFee).toBe(0);
    expect(res.data.deliveryQuoteId).toBeNull();
    expect(res.data.packagingFee).toBe(15);
  });

  it("fails closed when a delivery quote has no id or expiry", async () => {
    const { transport, ...NO_TOKENS } = transportReturning({
      serviceable: true,
      packagingFee: 15,
      deliveryFee: 57,
    });
    const res = await requestCheckoutFees(
      buildCheckoutFeesContext({ storeId: "demo", orderType: "delivery", dropLat: 23.03, dropLng: 72.58 }),
      { transport, ...NO_TOKENS },
    );
    expect(res.success).toBe(false);
  });

  // Every real store is currently unlinked, so /checkout/fees answers
  // 409 STORE_NOT_LINKED. A generic retryable error would invite a retry that
  // can never work.
  it("propagates 409 STORE_NOT_LINKED with the payment-screen copy and no retry", async () => {
    const transport: CheckoutFeesTransport = {
      post: () => {
        throw Object.assign(new Error("HTTP 409"), {
          status: 409,
          response: {
            status: 409,
            data: { code: "STORE_NOT_LINKED", error: "Store is not linked to a partner branch." },
          },
        });
      },
    };
    const res = await requestCheckoutFees(
      buildCheckoutFeesContext({ storeId: "demo", orderType: "delivery", dropLat: 23.03, dropLng: 72.58 }),
      { transport, ...NO_TOKENS },
    );

    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("STORE_NOT_LINKED");
    expect(res.error.retryable).toBe(false);
    expect(res.error.message).toBe("This outlet isn't taking online orders yet.");
  });

  it("keeps a 503/provider outage retryable", async () => {
    const transport: CheckoutFeesTransport = {
      post: () => {
        throw Object.assign(new Error("HTTP 503"), { status: 503 });
      },
    };
    const res = await requestCheckoutFees(
      buildCheckoutFeesContext({ storeId: "demo", orderType: "delivery", dropLat: 23.03, dropLng: 72.58 }),
      { transport, ...NO_TOKENS },
    );
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.retryable).toBe(true);
    expect(res.error.code).toBe("DELIVERY_QUOTE_FAILED");
  });
});

describe("CUS-13 — the fee request targets the Functions API", () => {
  const ctx = buildCheckoutFeesContext({
    storeId: "demo",
    orderType: "delivery",
    dropLat: 23.03,
    dropLng: 72.58,
  });

  it("posts to exactly the Functions base + /checkout/fees, never the .example placeholder", async () => {
    const { transport, calls } = transportReturning(deliveryResponse(57, "q_base"));
    await requestCheckoutFees(ctx, { transport, ...NO_TOKENS });

    expect(calls[0].url).toBe(`${defaultFunctionsBase()}/checkout/fees`);
    expect(calls[0].url).not.toContain(".example");
    expect(calls[0].url).not.toContain("api.dev.burgonomics.example");
    // The Functions base, not the payments base (which ends in /api/payments)
    // and not a relative path httpClient would re-base.
    expect(calls[0].url.endsWith("/checkout/fees")).toBe(true);
    expect(calls[0].url).not.toContain("/api/payments/checkout/fees");
  });

  it("never resolves to a .example host in the current build", () => {
    // The helper (shared with the Petpooja gateway) ignores
    // appConfig.api.baseUrl and the build mode entirely, so this holds for
    // every bundle.
    expect(defaultFunctionsBase()).not.toContain(".example");
    expect(checkoutFeesUrl()).not.toContain(".example");
    expect(checkoutFeesUrl()).toBe(`${defaultFunctionsBase()}/checkout/fees`);
  });

  it("carries the Firebase ID token and the App Check header", async () => {
    const { transport, calls } = transportReturning(deliveryResponse(57, "q_auth"));
    await requestCheckoutFees(ctx, {
      transport,
      idToken: async () => "firebase-id-token",
      appCheckToken: async () => "app-check-token",
    });

    expect(calls[0].headers?.authorization).toBe("Bearer firebase-id-token");
    expect(calls[0].headers?.["X-Firebase-AppCheck"]).toBe("app-check-token");
  });
});

describe("the fee request sends exactly one authorization header", () => {
  const ctx = buildCheckoutFeesContext({
    storeId: "demo",
    orderType: "delivery",
    dropLat: 23.03,
    dropLng: 72.58,
  });

  it("the httpClient interceptor overrides (not duplicates) the service token", async () => {
    // `setupHttpAuth` registers this exact interceptor on every run.
    httpClient.useRequest((req) => ({
      ...req,
      headers: { ...req.headers, authorization: "Bearer FRESH_FROM_INTERCEPTOR" },
    }));

    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            serviceable: true,
            packagingFee: 15,
            deliveryFee: 57,
            deliveryQuoteId: "q_merge",
            expiresAt: Date.now() + 60_000,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      await requestCheckoutFees(ctx, {
        idToken: async () => "STALE_SERVICE_TOKEN",
        appCheckToken: async () => "app-check-token",
      });

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      // The REAL merge the browser performs. Two differently-cased keys would
      // become "Bearer STALE_SERVICE_TOKEN, Bearer FRESH_FROM_INTERCEPTOR".
      const merged = new Headers(init.headers);
      expect(merged.get("authorization")).toBe("Bearer FRESH_FROM_INTERCEPTOR");
      expect(merged.get("authorization")).not.toContain(",");
      expect(merged.get("x-firebase-appcheck")).toBe("app-check-token");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("httpClient transport metadata", () => {
  it("keeps the HTTP status, body and server code on the mapped error", () => {
    const err = Object.assign(new Error("HTTP 409"), {
      status: 409,
      response: { status: 409, data: { code: "STORE_NOT_LINKED", error: "unlinked" } },
    });
    const mapped = mapTransportError(err) as Error & {
      status?: number;
      code?: string;
      response?: { data?: { code?: string } };
    };
    expect(mapped.status).toBe(409);
    expect(mapped.code).toBe("STORE_NOT_LINKED");
    expect(mapped.response?.data?.code).toBe("STORE_NOT_LINKED");
  });
});

describe("packaging comes only from the server", () => {
  it("prices no packaging without a server response (the client holds no number)", async () => {
    const totals = await cartRepository.calculateTotals();
    expect(totals.success).toBe(true);
    if (!totals.success) return;
    // takeaway, no quote yet: packaging must be 0, never 15/20 from the client.
    expect(totals.data.packingFee).toBe(0);
  });
});

describe("delivery quote state machine", () => {
  it("ignores a stale response from a previous address", async () => {
    let releaseOld: (() => void) | null = null;
    const transport: CheckoutFeesTransport = {
      post: (_url, body) => {
        const b = body as Record<string, unknown>;
        if (b.dropLat === 23.0) {
          // The OLD address answers only after the customer has moved on.
          return new Promise((resolve) => {
            releaseOld = () => resolve({ data: deliveryResponse(90, "q_old") });
          });
        }
        return Promise.resolve({ data: deliveryResponse(57, "q_new") });
      },
    };

    const oldCtx = buildCheckoutFeesContext({
      storeId: "demo",
      orderType: "delivery",
      dropLat: 23.0,
      dropLng: 72.5,
    });
    const newCtx = buildCheckoutFeesContext({
      storeId: "demo",
      orderType: "delivery",
      dropLat: 23.2,
      dropLng: 72.6,
    });

    const oldQuote = quoteCheckoutFees(oldCtx, { request: (c) => requestCheckoutFees(c, { transport, ...NO_TOKENS }) });
    const newQuote = quoteCheckoutFees(newCtx, { request: (c) => requestCheckoutFees(c, { transport, ...NO_TOKENS }) });
    await newQuote;
    expect(useCheckoutStore.getState().checkoutFees).toMatchObject({
      status: "ready",
      deliveryFee: 57,
      deliveryQuoteId: "q_new",
    });

    (releaseOld as (() => void) | null)?.();
    await oldQuote;

    // The late answer for the old address must never overwrite the new one.
    expect(useCheckoutStore.getState().checkoutFees).toMatchObject({
      status: "ready",
      deliveryFee: 57,
      deliveryQuoteId: "q_new",
    });
    expect(useCheckoutStore.getState().feesKey).toBe(checkoutFeesKey(newCtx));
  });

  it("marks an unserviceable address and keeps takeaway selectable", async () => {
    const { transport, ...NO_TOKENS } = transportReturning({
      serviceable: false,
      packagingFee: 15,
      reason: "not_serviced",
      message: "Address outside the serviced radius",
    });
    const state = await quoteCheckoutFees(
      buildCheckoutFeesContext({ storeId: "demo", orderType: "delivery", dropLat: 23.0, dropLng: 72.5 }),
      { request: (c) => requestCheckoutFees(c, { transport, ...NO_TOKENS }) },
    );

    expect(state).toMatchObject({ status: "unserviceable", packagingFee: 15 });
    const view = deliveryQuoteView({ state, fulfillment: "delivery", hasAddress: true });
    expect(view.payEnabled).toBe(false);
    expect(view.message).toBe("Delivery isn't available to this address");
    expect(view.takeawaySelectable).toBe(true);
    // Switching fulfillment is the honest escape hatch.
    const takeawayView = deliveryQuoteView({ state, fulfillment: "takeaway", hasAddress: true });
    expect(takeawayView.message).not.toBe("Delivery isn't available to this address");
  });

  it("shows no static fee during a provider outage and offers a retry", async () => {
    const transport: CheckoutFeesTransport = {
      post: () => Promise.reject(new Error("NO_SERVICEABLE_PROVIDER")),
    };
    const state = await quoteCheckoutFees(
      buildCheckoutFeesContext({ storeId: "demo", orderType: "delivery", dropLat: 23.0, dropLng: 72.5 }),
      { request: (c) => requestCheckoutFees(c, { transport, ...NO_TOKENS }) },
    );

    expect(state.status).toBe("error");
    const view = deliveryQuoteView({ state, fulfillment: "delivery", hasAddress: true });
    expect(view.payEnabled).toBe(false);
    expect(view.showDeliveryFee).toBe(false);
    expect(view.showTotal).toBe(false);
    expect(view.deliveryFee).toBeNull();
    expect(view.canRetry).toBe(true);
    expect(view.message).toBe("Delivery isn't available to this address");

    // And the bill never falls back to ₹35 / ₹40 / free delivery.
    const totals = await cartRepository.calculateTotals();
    expect(totals.success).toBe(true);
    if (!totals.success) return;
    expect(totals.data.deliveryFee).toBe(0);
  });

  it("treats an unlinked outlet as terminal — no retry, honest copy", async () => {
    const transport: CheckoutFeesTransport = {
      post: () => {
        throw Object.assign(new Error("HTTP 409"), {
          status: 409,
          response: { status: 409, data: { code: "STORE_NOT_LINKED" } },
        });
      },
    };
    const state = await quoteCheckoutFees(
      buildCheckoutFeesContext({ storeId: "demo", orderType: "delivery", dropLat: 23.0, dropLng: 72.5 }),
      { request: (c) => requestCheckoutFees(c, { transport, ...NO_TOKENS }) },
    );

    expect(state).toMatchObject({ status: "error", code: "STORE_NOT_LINKED" });
    const view = deliveryQuoteView({ state, fulfillment: "delivery", hasAddress: true });
    expect(view.payEnabled).toBe(false);
    expect(view.message).toBe("This outlet isn't taking online orders yet.");
    expect(view.canRetry).toBe(false);
    expect(view.storeNotLinked).toBe(true);
    // Nothing is orderable at this outlet, so switching fulfillment is not a
    // useful escape hatch either.
    expect(view.takeawaySelectable).toBe(false);
  });

  it("uses the quoted fee and packaging in the bill once ready", async () => {
    const { transport, ...NO_TOKENS } = transportReturning(deliveryResponse(57, "q_ready"));
    await quoteCheckoutFees(
      buildCheckoutFeesContext({ storeId: "demo", orderType: "delivery", dropLat: 23.0, dropLng: 72.5 }),
      { request: (c) => requestCheckoutFees(c, { transport, ...NO_TOKENS }) },
    );

    const totals = await cartRepository.calculateTotals();
    expect(totals.success).toBe(true);
    if (!totals.success) return;
    // 300 food (discount 0) + server packaging 15 + quoted delivery 57.
    expect(totals.data.deliveryFee).toBe(57);
    expect(totals.data.packingFee).toBe(15);
    expect(totals.data.grandTotal).toBe(372);
  });

  it("treats an expired quote as unusable and schedules a re-quote", () => {
    const now = 1_700_000_000_000;
    const state: CheckoutFeesState = {
      status: "ready",
      orderType: "delivery",
      packagingFee: 15,
      deliveryFee: 57,
      deliveryQuoteId: "q_old",
      provider: "borzo",
      expiresAt: now - 1,
    };
    expect(isCheckoutFeesExpired(state, now)).toBe(true);
    expect(isCheckoutFeesUsable(state, now)).toBe(false);

    const view = deliveryQuoteView({ state, fulfillment: "delivery", hasAddress: true, now });
    expect(view.payEnabled).toBe(false);
    expect(view.message).toBe("Getting delivery price");

    const fresh = { ...state, expiresAt: now + 10_000 };
    expect(nextRequoteDelay(fresh, now)).toBe(10_500);
  });

  it("gates cash on delivery with the same quote states", () => {
    // The view model is payment-method agnostic on purpose: cash may not skip
    // the delivery quote, because the fee is part of the amount owed.
    const loading = deliveryQuoteView({
      state: { status: "loading" },
      fulfillment: "delivery",
      hasAddress: true,
    });
    expect(loading.payEnabled).toBe(false);
    expect(loading.message).toBe("Getting delivery price");

    const ready = deliveryQuoteView({
      state: {
        status: "ready",
        orderType: "delivery",
        packagingFee: 15,
        deliveryFee: 57,
        deliveryQuoteId: "q_cod",
        provider: "shadowfax",
        expiresAt: Date.now() + 60_000,
      },
      fulfillment: "delivery",
      hasAddress: true,
    });
    expect(ready.payEnabled).toBe(true);
    expect(ready.deliveryFee).toBe(57);
  });
});

describe("fee-failure wording follows the fulfillment", () => {
  const errorState: CheckoutFeesState = { status: "error", code: "DELIVERY_QUOTE_FAILED" };

  it("a takeaway fee failure talks about the price and keeps Retry", () => {
    const view = deliveryQuoteView({ state: errorState, fulfillment: "takeaway", hasAddress: true });
    expect(view.payEnabled).toBe(false);
    expect(view.canRetry).toBe(true);
    expect(view.message).toBe("We couldn't load your order price. Please try again.");
    expect(view.message?.toLowerCase()).not.toContain("delivery");
  });

  it("a delivery fee failure still says delivery is unavailable", () => {
    const view = deliveryQuoteView({ state: errorState, fulfillment: "delivery", hasAddress: true });
    expect(view.message).toBe("Delivery isn't available to this address");
    expect(view.canRetry).toBe(true);
  });
});

describe("parseCheckoutFees expiry normalisation", () => {
  it("accepts ms, seconds and ISO expiries", () => {
    const ms = parseCheckoutFees(
      { ...deliveryResponse(57, "q"), expiresAt: 1_700_000_000_000 },
      "delivery",
    );
    expect(ms?.serviceable && ms.expiresAt).toBe(1_700_000_000_000);

    const seconds = parseCheckoutFees(
      { ...deliveryResponse(57, "q"), expiresAt: 1_700_000_000 },
      "delivery",
    );
    expect(seconds?.serviceable && seconds.expiresAt).toBe(1_700_000_000_000);

    const iso = parseCheckoutFees(
      { ...deliveryResponse(57, "q"), expiresAt: "2026-10-31T12:00:00.000Z" },
      "delivery",
    );
    expect(iso?.serviceable && iso.expiresAt).toBe(Date.parse("2026-10-31T12:00:00.000Z"));
  });
});
