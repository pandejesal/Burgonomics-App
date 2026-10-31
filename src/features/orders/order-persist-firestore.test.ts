/**
 * CUS-06 regression — order persistence against the REAL Firestore SDK.
 *
 * Every other order test mocks `firebase/firestore`, which is exactly why 818
 * green tests missed a total checkout outage: `ordersService.createOrder`
 * (src/features/orders/services/ordersService.ts:453) hands `setDoc` an order
 * payload whose optional leaves are `undefined` (notes,
 * fulfillmentInstructions, tableNumber, payment.transactionId,
 * payment.paidAt, branchCoordinates), and the app's Firestore instance was
 * built with plain `getFirestore()` — no `ignoreUndefinedProperties`.
 *
 * The SDK validates the write locally and THROWS BEFORE any request:
 *
 *   FirebaseError: Function setDoc() called with invalid data.
 *   Unsupported field value: undefined (found in field notes ...)
 *
 * `ordersService` turns that into PERSIST_FAILED, so Razorpay never opens.
 * See staging-review-20261030/06-provider-evidence/order-persist-repro.md.
 *
 * This test uses no mock and no emulator: it builds real Firestore instances
 * from a dummy project config. Data validation happens before network I/O, so
 * the "accepted" assertion only needs to observe that `setDoc` does not throw
 * synchronously; the pending write is swallowed and the instance terminated.
 */
import { deleteApp, initializeApp } from "firebase/app";
import { doc, getFirestore, setDoc, terminate } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import { db as appDb } from "@/core/config/firebase";
import type { Order } from "@/features/orders/models";

const DUMMY_CONFIG = {
  apiKey: "AIzaSyTestKeyForTesting123456789",
  authDomain: "test-project.firebaseapp.com",
  projectId: "test-project",
  storageBucket: "test-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456",
};

/**
 * The exact shape `ordersService.createOrder` writes (ordersService.ts:393-475):
 * an online, not-yet-paid delivery order, so every optional leaf is
 * `undefined` — the six paths the evidence probe recorded as
 * ["notes","fulfillmentInstructions","tableNumber","payment.transactionId",
 *  "payment.paidAt","branchCoordinates"].
 */
function persistedOrderPayload(): Record<string, unknown> {
  const order: Order = {
    id: "ord_1761800000000_ABCDEF",
    shortCode: "ABCDEF",
    status: { code: "PLACED", label: "Placed", kind: "order", terminal: false },
    fulfillment: "delivery",
    store: {
      id: "str_qa",
      name: "Surat Vesu",
      lat: 21.1518,
      lng: 72.7758,
    } as Order["store"],
    items: [
      {
        lineId: "line_1",
        productId: "prod_1",
        name: "Classic Smash",
        storeId: "str_qa",
        quantity: 1,
        unitPrice: 199,
        price: 199,
        availability: "available",
        modifiers: [],
      },
    ],
    totals: { subtotal: 199, taxes: 0, grandTotal: 199 } as Order["totals"],
    promo: null,
    tipAmount: 0,
    loyaltyPointsRedeemed: 0,
    // Empty checkout fields — exactly what a customer who leaves them blank
    // produces (OrderRepository.ts:185-187).
    notes: undefined,
    fulfillmentInstructions: undefined,
    tableNumber: undefined,
    payment: {
      method: "upi",
      label: "UPI",
      // A payment-pending order is not paid yet (OrderRepository.ts:167-173).
      status: "pending",
      transactionId: undefined,
      paidAt: undefined,
    } as Order["payment"],
    petpoojaStatus: "Pending",
    placedAt: "2026-10-31T00:00:00.000Z",
  };
  return {
    ...order,
    deliveryAddress: order.address,
    userId: "uid_customer_1",
    customerId: "uid_customer_1",
    petpoojaStatus: "Pending",
    createdAt: "2026-10-31T00:00:00.000Z",
    updatedAt: "2026-10-31T00:00:00.000Z",
    branchId: null,
    // ordersService.ts:471-474 — undefined when the store has no pin.
    branchCoordinates: undefined,
  };
}

describe("CUS-06 — the app's Firestore instance accepts the real order payload", () => {
  it("setDoc validates an order carrying undefined leaves without throwing", async () => {
    let write: Promise<void> | undefined;
    // Passing validation is the whole assertion: a plain getFirestore()
    // instance throws `invalid-argument` here before touching the network.
    expect(() => {
      write = setDoc(doc(appDb, "orders", "ord_1761800000000_ABCDEF"), persistedOrderPayload());
    }).not.toThrow();
    // No emulator/network here: cancel the queued write and stop the client.
    write?.catch(() => undefined);
    await terminate(appDb);
  });

  it("control: the same payload on a plain getFirestore() instance is rejected", async () => {
    const controlApp = initializeApp(DUMMY_CONFIG, `cus06-control-${Date.now()}`);
    const plainDb = getFirestore(controlApp);
    expect(() =>
      setDoc(doc(plainDb, "orders", "ord_control"), persistedOrderPayload()),
    ).toThrowError(/Unsupported field value: undefined/);
    await terminate(plainDb);
    await deleteApp(controlApp);
  });
});
