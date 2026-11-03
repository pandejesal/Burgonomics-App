import { beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({
  uid: "owner-a" as string | null,
  post: vi.fn(),
  headers: vi.fn(),
}));
vi.mock("@/core/config/firebase", () => ({
  auth: { get currentUser() { return transport.uid ? { uid: transport.uid } : null; } },
}));
vi.mock("@/core/network/httpClient", () => ({ httpClient: { post: transport.post } }));
vi.mock("@/features/checkout/services/deliveryQuoteService", () => ({
  buildCheckoutFeesHeaders: transport.headers,
}));

import { retrieveDeliveryCode } from "./deliveryCodeService";

const valid = { orderId: "order-a", deliveryOtp: "4826", version: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  transport.uid = "owner-a";
  transport.headers.mockResolvedValue({ authorization: "Bearer fixture", "X-Firebase-AppCheck": "fixture-attestation" });
  transport.post.mockResolvedValue({ data: valid });
});

describe("owner delivery-code transport", () => {
  it("requests a fresh genuine code with the existing authenticated App Check transport", async () => {
    const controller = new AbortController();
    expect(await retrieveDeliveryCode("order-a", "owner-a", controller.signal)).toEqual({ success: true, data: valid });
    expect(transport.post).toHaveBeenCalledWith(
      "http://localhost:5001/test-project/us-central1/api/orders/deliveryOtp",
      { orderId: "order-a" },
      expect.objectContaining({
        signal: controller.signal,
        headers: { authorization: "Bearer fixture", "X-Firebase-AppCheck": "fixture-attestation", "Cache-Control": "no-store" },
        retry: { attempts: 1, backoffMs: 0 },
      }),
    );
    await retrieveDeliveryCode("order-a", "owner-a");
    expect(transport.post).toHaveBeenCalledTimes(2); // no shared response cache
  });

  it.each([
    { ...valid, orderId: "other-order" },
    { ...valid, version: 1 },
    { ...valid, version: "2" },
    { ...valid, deliveryOtp: "0000" },
    { ...valid, deliveryOtp: "0123" },
    { ...valid, deliveryOtp: "12345" },
    { ...valid, deliveryOtp: "12a4" },
    { ...valid, deliveryOtp: 4826 },
    { ...valid, deliveryOtp: " 4826 " },
    { orderId: "order-a", version: 2 },
    null,
  ])("rejects a mismatched/versioned/malformed response: %j", async (data) => {
    transport.post.mockResolvedValue({ data });
    const result = await retrieveDeliveryCode("order-a", "owner-a");
    expect(result).toMatchObject({ success: false, error: { code: "INVALID_DELIVERY_CODE_RESPONSE", retryable: true } });
    expect(JSON.stringify(result)).not.toContain("4826");
  });

  it("keeps older-order unavailability distinct and permanent", async () => {
    transport.post.mockRejectedValue({ status: 409, response: { data: { error: { code: "LEGACY_OTP_UNAVAILABLE", message: "not shown" } } } });
    expect(await retrieveDeliveryCode("order-a", "owner-a")).toMatchObject({ success: false, error: { code: "LEGACY_OTP_UNAVAILABLE", retryable: false } });
  });

  it.each([401, 403, 404, 409, 429])("does not retry/refabricate a refused HTTP %i response", async (status) => {
    transport.post.mockRejectedValue({ status, response: { data: { code: "ORDER_NOT_ELIGIBLE", deliveryOtp: "4826" } } });
    const result = await retrieveDeliveryCode("order-a", "owner-a");
    expect(result).toMatchObject({ success: false, error: { retryable: false } });
    expect(transport.post).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("4826");
  });

  it.each([new TypeError("fixture network failure"), { status: 500 }, { status: 503 }])("offers an explicit retry for a transient failure", async (error) => {
    transport.post.mockRejectedValue(error);
    expect(await retrieveDeliveryCode("order-a", "owner-a")).toMatchObject({ success: false, error: { retryable: true } });
  });

  it.each([null, "other-owner"])("never requests under a missing or different Firebase account (%s)", async (uid) => {
    transport.uid = uid;
    expect(await retrieveDeliveryCode("order-a", "owner-a")).toMatchObject({ success: false, error: { code: "AUTH_CHANGED", retryable: false } });
    expect(transport.post).not.toHaveBeenCalled();
  });

  it("checks identity again after headers are resolved", async () => {
    transport.headers.mockImplementation(async () => { transport.uid = "other-owner"; return {}; });
    expect(await retrieveDeliveryCode("order-a", "owner-a")).toMatchObject({ success: false, error: { code: "AUTH_CHANGED" } });
    expect(transport.post).not.toHaveBeenCalled();
  });

  it("discards a response resolving after an account switch or cancellation", async () => {
    transport.post.mockImplementation(async () => { transport.uid = "other-owner"; return { data: valid }; });
    expect(await retrieveDeliveryCode("order-a", "owner-a")).toMatchObject({ success: false, error: { code: "AUTH_CHANGED" } });
    transport.uid = "owner-a";
    const controller = new AbortController();
    transport.post.mockImplementation(async () => { controller.abort(); return { data: valid }; });
    expect(await retrieveDeliveryCode("order-a", "owner-a", controller.signal)).toMatchObject({ success: false, error: { code: "AUTH_CHANGED" } });
  });
});
