/**
 * Edge cases for the owner delivery-code transport that the happy-path suite
 * does not pin:
 *  - an HTTP 200 whose body is an error envelope (the classic "success status,
 *    failure payload" shape) must never be read as a code,
 *  - a body that is missing the version discriminator entirely,
 *  - the exact boundary digits the server regex accepts (1000 / 9999),
 *  - a signal that is already aborted before the call starts,
 *  - the legacy-code marker surfaced at the top level instead of nested under
 *    `error`,
 *  - additive server fields must not break parsing.
 */
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
  transport.headers.mockResolvedValue({ authorization: "Bearer fixture" });
  transport.post.mockResolvedValue({ data: valid });
});

describe("delivery-code response body shapes", () => {
  it.each([
    // 200 + error envelope, with the real code leaked alongside it.
    { error: { code: "ORDER_NOT_ELIGIBLE" }, deliveryOtp: "4826" },
    { code: "ORDER_NOT_ELIGIBLE", deliveryOtp: "4826" },
    { error: { message: "nope" } },
    // Version discriminator absent entirely (v1 docs omit it).
    { orderId: "order-a", deliveryOtp: "4826" },
    // No body at all.
    undefined,
    null,
  ])("refuses an HTTP 200 body that is not a version-2 code: %j", async (data) => {
    transport.post.mockResolvedValue({ data });
    const result = await retrieveDeliveryCode("order-a", "owner-a");
    expect(result).toMatchObject({
      success: false,
      error: { code: "INVALID_DELIVERY_CODE_RESPONSE", retryable: true },
    });
    expect(JSON.stringify(result)).not.toContain("4826");
  });

  it.each(["1000", "9999"])("accepts the exact boundary code %s", async (deliveryOtp) => {
    transport.post.mockResolvedValue({ data: { ...valid, deliveryOtp } });
    expect(await retrieveDeliveryCode("order-a", "owner-a")).toEqual({
      success: true,
      data: { orderId: "order-a", deliveryOtp, version: 2 },
    });
  });

  it("tolerates additive server fields without forwarding them to callers", async () => {
    transport.post.mockResolvedValue({
      data: { ...valid, expiresAt: "2026-11-04T00:00:00.000Z", serverBuild: "fixture" },
    });
    const result = await retrieveDeliveryCode("order-a", "owner-a");
    expect(result).toEqual({ success: true, data: valid });
    if (result.success) {
      expect(result.data).not.toHaveProperty("expiresAt");
      expect(result.data).not.toHaveProperty("serverBuild");
    }
  });
});

describe("delivery-code request preconditions and legacy signalling", () => {
  it("never calls the endpoint when the caller's signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await retrieveDeliveryCode("order-a", "owner-a", controller.signal)).toMatchObject({
      success: false,
      error: { code: "AUTH_CHANGED", retryable: false },
    });
    expect(transport.post).not.toHaveBeenCalled();
  });

  it("recognises the legacy marker when it is at the top level of the error body", async () => {
    transport.post.mockRejectedValue({
      status: 409,
      response: { data: { code: "LEGACY_OTP_UNAVAILABLE" } },
    });
    expect(await retrieveDeliveryCode("order-a", "owner-a")).toMatchObject({
      success: false,
      error: { code: "LEGACY_OTP_UNAVAILABLE", retryable: false },
    });
  });
});
