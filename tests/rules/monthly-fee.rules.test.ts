/**
 * Canonical union rules (owner sync 1 Nov 2026) — emulator cases 19-21 and 22i
 * from the monthly-fee contract, plus the CUS-06 regression that matters most:
 * a REAL customer delivery create, including `deliveryQuoteId`, must succeed.
 */
import { readFileSync } from "fs";
import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const PROJECT_ID = "burgonomics-test-rules";
const EMULATOR_PORT = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080);

const BRANCH = "branch_01";

describe("Canonical union rules — monthly fee, markers, catalog and customer create", () => {
  let testEnv: RulesTestEnvironment | null = null;
  let emulatorAvailable = false;

  beforeAll(async () => {
    try {
      testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
          rules: readFileSync("firestore.rules", "utf8"),
          host: "127.0.0.1",
          port: EMULATOR_PORT,
        },
      });
      emulatorAvailable = true;
    } catch {
      console.warn(
        `Firestore Emulator is not running on 127.0.0.1:${EMULATOR_PORT}. Skipping rules integration tests.`,
      );
      emulatorAvailable = false;
    }
  });

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  beforeEach(async (context) => {
    if (!emulatorAvailable || !testEnv) {
      if (process.env.CI === "true") {
        throw new Error(
          "Firestore emulator unavailable in CI — start one and run `node scripts/test-rules.mjs`.",
        );
      }
      context.skip();
      return;
    }
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "admins", "brand_owner_1"), { role: "brand_owner" });
      await setDoc(doc(db, "admins", "branch_owner_1"), {
        role: "branch_owner",
        branchId: BRANCH,
      });
      await setDoc(doc(db, "admins", "branch_owner_2"), {
        role: "branch_owner",
        branchId: "branch_02",
      });
      await setDoc(doc(db, "branches", BRANCH), {
        name: "Branch One",
        city: "Surat",
        monthlyFee: 2500,
        packagingFee: 15,
        packaging: { charge: 15 },
        isDeleted: false,
      });
      await setDoc(doc(db, "branch_monthly_fees", `${BRANCH}_2026-11`), {
        branchId: BRANCH,
        monthKey: "2026-11",
        feePaise: 250000,
        feeCollectedPaise: 0,
      });
      await setDoc(doc(db, "products", "prod_1"), {
        name: "Burger",
        price: 299,
        branchId: BRANCH,
        inStock: true,
      });
      await setDoc(doc(db, "orders", "ord_seed_1"), {
        customerId: "cust_100",
        userId: "cust_100",
        branchId: BRANCH,
        paymentStatus: "pending",
        status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
        totals: { grandTotal: 500 },
      });
    });
  });

  it("19: branch owner cannot move monthlyFee/packaging; unrelated field and brand owner can", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const branchDb = testEnv!.authenticatedContext("branch_owner_1").firestore();
    for (const patch of [
      { monthlyFee: 0 },
      { packagingFee: 0 },
      { packaging: { charge: 50 } },
      { royaltyPercentage: 0 },
      { brandRoyaltyPercent: 0 },
    ]) {
      await assertFails(updateDoc(doc(branchDb, "branches", BRANCH), patch));
    }
    await assertSucceeds(updateDoc(doc(branchDb, "branches", BRANCH), { name: "Renamed" }));
    const brandDb = testEnv!.authenticatedContext("brand_owner_1").firestore();
    await assertSucceeds(updateDoc(doc(brandDb, "branches", BRANCH), { monthlyFee: 0 }));
  });

  it("20 + 22i: clients cannot plant refund accounting at create", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const db = testEnv!.authenticatedContext("cust_100").firestore();
    const base = customerDeliveryOrder();
    for (const planted of [
      { refundLedger: [{ amount: 100 }] },
      { refundedTotalPaise: 100 },
      { refundOverCapturedPaise: 100 },
      { refundNeedsReview: true },
      { paymentChannel: "razorpay" },
      { monthlyFeeHold: { holdPaise: 1 } },
    ]) {
      await assertFails(setDoc(doc(db, "orders", `ord_plant_${Object.keys(planted)[0]}`), { ...base, ...planted }));
    }
  });

  it("20: clients cannot write the payment/markers on update", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const db = testEnv!.authenticatedContext("cust_100").firestore();
    for (const patch of [
      { paymentChannel: "razorpay" },
      { monthlyFeeHold: { holdPaise: 1 } },
      { routeTransferNeedsManualSettlement: true },
      { refundedTotalPaise: 1 },
      { paymentStatus: "completed" },
      { payment: { method: "upi", status: "completed" } },
    ]) {
      await assertFails(updateDoc(doc(db, "orders", "ord_seed_1"), patch));
    }
    // The scoped customer lanes still work.
    await assertSucceeds(updateDoc(doc(db, "orders", "ord_seed_1"), { whatsappOptIn: false }));
  });

  it("CUS-06: a real delivery create with deliveryQuoteId succeeds", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const db = testEnv!.authenticatedContext("cust_100").firestore();
    await assertSucceeds(setDoc(doc(db, "orders", "ord_real_delivery"), customerDeliveryOrder()));
  });

  it("21: branch ledger is tenant-scoped, server-write-only", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const docId = `${BRANCH}_2026-11`;
    await assertSucceeds(
      getDoc(doc(testEnv!.authenticatedContext("branch_owner_1").firestore(), "branch_monthly_fees", docId)),
    );
    await assertSucceeds(
      getDoc(doc(testEnv!.authenticatedContext("brand_owner_1").firestore(), "branch_monthly_fees", docId)),
    );
    await assertFails(
      getDoc(doc(testEnv!.authenticatedContext("branch_owner_2").firestore(), "branch_monthly_fees", docId)),
    );
    await assertFails(
      getDoc(doc(testEnv!.authenticatedContext("cust_100").firestore(), "branch_monthly_fees", docId)),
    );
    const branchDb = testEnv!.authenticatedContext("branch_owner_1").firestore();
    await assertFails(setDoc(doc(branchDb, "branch_monthly_fees", "forged"), { branchId: BRANCH }));
    await assertFails(updateDoc(doc(branchDb, "branch_monthly_fees", docId), { feeCollectedPaise: 0 }));
  });

  it("22i: branch cannot repriced catalog data, but the 86 toggle still works", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const db = testEnv!.authenticatedContext("branch_owner_1").firestore();
    for (const patch of [
      { customizations: [{ id: "g", options: [] }] },
      { packingCharge: 0 },
      { priceAvailable: false },
      { price: 1 },
    ]) {
      await assertFails(updateDoc(doc(db, "products", "prod_1"), patch));
    }
    await assertSucceeds(updateDoc(doc(db, "products", "prod_1"), { inStock: false }));
  });
});

/** Mirrors the persisted ordersService.createOrder payload (delivery, quote). */
function customerDeliveryOrder(): Record<string, unknown> {
  return {
    id: "ord_real_delivery",
    shortCode: "REAL01",
    customerId: "cust_100",
    userId: "cust_100",
    branchId: BRANCH,
    fulfillment: "delivery",
    status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
    store: { id: "store_1", name: "Branch One", lat: 21.15, lng: 72.77 },
    address: { line1: "1 Test Road", city: "Surat", pincode: "395007" },
    deliveryAddress: { line1: "1 Test Road", city: "Surat", pincode: "395007" },
    deliveryQuoteId: "q_del_1",
    items: [{ productId: "prod_1", name: "Burger", quantity: 1, unitPrice: 299 }],
    totals: { subtotal: 299, grandTotal: 361 },
    promo: null,
    tipAmount: 0,
    loyaltyPointsRedeemed: 0,
    payment: { method: "online", label: "Pay Online", status: "pending" },
    paymentStatus: "pending",
    whatsappOptIn: true,
    placedAt: "2026-11-01T00:00:00.000Z",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
}
