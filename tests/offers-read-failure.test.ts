import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { getDocs } = vi.hoisted(() => ({ getDocs: vi.fn() }));
vi.mock("../src/core/config/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({ collection: vi.fn(), getDocs, doc: vi.fn(), getDoc: vi.fn() }));
import { offersService } from "../src/features/offers/services/offersService";

beforeEach(() => {
  getDocs.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());
describe("offers read outcomes", () => {
  it("returns a retryable failure rather than a successful empty bundle on outage", async () => {
    getDocs.mockRejectedValue(new Error("offline"));
    const result = await offersService.list();
    expect(result).toEqual({ success: false, error: {
      code: "OFFERS_UNAVAILABLE", message: "Could not load offers. Please try again.", retryable: true,
    } });
  });
  it("keeps a genuine empty query successful", async () => {
    getDocs.mockResolvedValue({ forEach: vi.fn() });
    const result = await offersService.list();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error.code);
    expect(result.data.offers).toEqual([]);
  });
  it("does not misreport read failures as invalid coupons or missing offers", async () => {
    getDocs.mockRejectedValue(new Error("offline"));
    for (const result of [
      await offersService.validateCoupon("SAVE", { subtotal: 100 }),
      await offersService.apply({ offerId: "offer", subtotal: 100 }),
    ]) {
      expect(result.success).toBe(false);
      if (result.success) throw new Error("Expected failure");
      expect(result.error.code).toBe("OFFERS_UNAVAILABLE");
    }
  });
});
