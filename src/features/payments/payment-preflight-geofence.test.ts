/** @vitest-environment jsdom */
/**
 * CUS-02 — the payment preflight must enforce the delivery geofence.
 *
 * `validateForPayment()` used to check only that a delivery address EXISTED,
 * while the same check on checkout.tsx blocked addresses beyond the store's
 * `deliveryRadiusKm`. Reaching /payment directly (deep-link, browser history,
 * back-navigation) skipped checkout and let an out-of-range address open the
 * gateway. The validator already existed (`isStoreInDeliveryArea`), so the
 * preflight now calls it instead of growing a second distance formula.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const cartRepositoryMock = vi.hoisted(() => ({
  calculateTotals: vi.fn(),
  validateCart: vi.fn(),
}));

vi.mock("@/features/cart/repositories/CartRepository", () => ({
  cartRepository: cartRepositoryMock,
}));
// PaymentRepository imports these for the order/gateway paths this test never
// reaches; stubbing them keeps the preflight hermetic.
vi.mock("@/features/orders/repositories/OrderRepository", () => ({
  orderRepository: {},
}));
vi.mock("@/features/payments/services/paymentsService", () => ({
  paymentsService: {},
}));

import { PaymentRepository } from "@/features/payments/repositories/PaymentRepository";
import { useCartStore } from "@/features/cart/state/cartStore";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useAddressStore } from "@/features/addresses/state/addressStore";
import { useAuthStore } from "@/features/auth/state/authStore";
import type { Store } from "@/features/stores/models/Store";

const STORE = {
  id: "str_surat",
  name: "Surat Vesu",
  lat: 19.0,
  lng: 72.8,
  deliveryRadiusKm: 7,
  isOpen: true,
  pricing: { minOrderAmount: 0 },
} as unknown as Store;

const addressAt = (lat: number, lng: number) => ({
  id: "addr_1",
  label: "home" as const,
  line1: "1 Test Road",
  city: "Surat",
  pincode: "395007",
  lat,
  lng,
  isDefault: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  cartRepositoryMock.validateCart.mockResolvedValue({ success: true, data: { valid: true, issues: [] } });
  cartRepositoryMock.calculateTotals.mockResolvedValue({
    success: true,
    data: { subtotal: 500, taxes: 0, packingFee: 0, deliveryFee: 0, promoDiscount: 0, loyaltyDiscount: 0, grandTotal: 500 },
  });
  useCartStore.setState({
    lines: [
      {
        lineId: "l1",
        productId: "prod_1",
        name: "Classic Smash",
        storeId: STORE.id,
        quantity: 1,
        unitPrice: 500,
        price: 500,
        availability: "available",
        modifiers: [],
      },
    ],
    storeId: STORE.id,
    status: "ready",
  });
  useStoreSelection.setState({ activeStore: STORE, fulfillment: "delivery" });
  useAuthStore.setState({
    status: "authenticated",
    user: { id: "usr_1", phone: "+919825012345" },
    accessToken: "token",
    refreshToken: "refresh",
  });
});

describe("CUS-02 — delivery geofence is enforced before the gateway opens", () => {
  it("rejects a delivery address far outside the store radius", async () => {
    useAddressStore.setState({ addresses: [addressAt(28.6, 77.2)], selectedId: "addr_1" });

    const res = await new PaymentRepository().validateForPayment();

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.valid).toBe(false);
    expect(res.data.issues.map((i) => i.code)).toContain("out_of_range");
    expect(res.data.issues.find((i) => i.code === "out_of_range")?.message).toMatch(
      /outside our 7 km delivery area/,
    );
    // The gateway-blocking verdict is what matters: no cart revalidation /
    // network work is needed to reject it.
    expect(cartRepositoryMock.validateCart).not.toHaveBeenCalled();
  });

  it("still allows a delivery address inside the store radius", async () => {
    useAddressStore.setState({ addresses: [addressAt(19.02, 72.81)], selectedId: "addr_1" });

    const res = await new PaymentRepository().validateForPayment();

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.issues.map((i) => i.code)).not.toContain("out_of_range");
    expect(res.data.valid).toBe(true);
  });
});
