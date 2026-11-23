import { describe, it, expect, vi, beforeEach } from "vitest";

const fixture = vi.hoisted(() => ({
  currentUser: { uid: "uid_1" },
  serverDoc: null as Record<string, any> | null,
  getDoc: vi.fn(),
}));

vi.mock("@/core/config/firebase", () => ({
  auth: {
    get currentUser() {
      return fixture.currentUser;
    },
    authStateReady: () => Promise.resolve(),
  },
  db: { kind: "db" },
}));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, path: string, id: string) => ({ path, id }),
  getDoc: (ref: unknown) => fixture.getDoc(ref),
}));

import { ordersService } from "./ordersService";

const serverPaidDoc = () => ({
  customerId: "uid_1",
  userId: "uid_1",
  shortCode: "BG-EVID",
  status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
  fulfillment: "delivery",
  store: { id: "s1", name: "Outlet", address: "Ahmedabad", area: "", city: "", phone: "" },
  items: [{ name: "Veg Burger", quantity: 1, unitPrice: 268 }],
  totals: { subtotal: 268, taxes: 10.19, deliveryFee: 45, grandTotal: 259 },
  pricing: { foodSubtotal: 268, deliveryFee: 45, grandTotal: 259, discount: 54 },
  placedAt: "2026-11-22T10:00:00Z",
  paymentStatus: "completed",
  payment: {
    method: "upi",
    label: "Paid Online",
    status: "completed",
    capturedAmountPaise: 25900,
    razorpayPaymentId: "pay_1",
    verifiedAt: "2026-11-22T10:00:05Z",
  },
});

describe("M8 r2 — checkout finalisation keeps server payment evidence", () => {
  beforeEach(() => {
    fixture.currentUser = { uid: "uid_1" };
    fixture.serverDoc = null;
    fixture.getDoc.mockReset();
    fixture.getDoc.mockImplementation(() =>
      Promise.resolve({ exists: () => true, data: () => fixture.serverDoc }),
    );
  });

  it("2a. finalizePaidOrder preserves the nested capturedAmountPaise", async () => {
    fixture.serverDoc = serverPaidDoc();
    const res = await ordersService.finalizePaidOrder({
      confirmedOrderId: "ord_evidence",
      expectedTransactionId: "pay_1",
    });

    expect(res.success).toBe(true);
    const payment = ((res as any)?.data as any)?.payment ?? {};
    expect(payment.capturedAmountPaise).toBe(25900);
    expect(payment.status).toBe("paid");
    expect(payment.transactionId).toBe("pay_1");
  });
});
