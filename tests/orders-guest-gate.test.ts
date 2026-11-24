/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
vi.mock("../src/features/auth/utils/scopedPersistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/features/auth/utils/scopedPersistence")>()),
  currentScopedUid: () => null,
}));
vi.mock("../src/features/orders/services/ordersService", () => ({ ordersService: {} }));
import { OrderRepository } from "../src/features/orders/repositories/OrderRepository";

describe("guest order gate", () => {
  it("rejects server draft creation before any cart or network work", async () => {
    const result = await new OrderRepository().createOnlineDraft();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("UNAUTHENTICATED");
      expect(result.error.retryable).toBe(false);
    }
  });
});
