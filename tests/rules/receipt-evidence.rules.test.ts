import { readFileSync } from "fs";
import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, getDoc } from "firebase/firestore";

/**
 * M8 r4 — receipt money evidence must be UNCHANGED by client writes. Staff may
 * still edit unrelated order fields; only the server merge-set that stamps the
 * capture / cash collection may introduce or change the evidence block.
 */
const PROJECT_ID = "burgonomics-test-rules";
const EMULATOR_PORT = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080);
const CUSTOMER_UID = "cust_receipt";
const BRANCH = "branch_receipt";
const ORDER = "order_receipt_evidence";

const ACTORS = [
  { label: "branch_staff(own branch)", uid: "receipt_staff" },
  { label: "branch_owner(own branch)", uid: "receipt_owner" },
  { label: "brand_owner", uid: "receipt_brand" },
  { label: "customer(order owner)", uid: CUSTOMER_UID },
];

const RECEIPT_EVIDENCE = {
  kind: "cash",
  paise: 25900,
  stampedAtMs: 1763800000000,
  by: "server",
};

const EVIDENCE_PATCHES = [
  { label: "receiptEvidence", patch: { receiptEvidence: { ...RECEIPT_EVIDENCE, paise: 999999 } } },
  { label: "top-level cashCollectedPaise", patch: { cashCollectedPaise: 999999 } },
  { label: "nested payment.capturedAmountPaise", patch: { "payment.capturedAmountPaise": 999999 } },
];

describe("Firestore Security Rules — receipt evidence is server-only, unrelated edits allowed", () => {
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
      console.warn("Firestore Emulator unavailable — receipt evidence rules tests cannot run.");
      emulatorAvailable = false;
    }
  });

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  beforeEach(async (context) => {
    if (!emulatorAvailable || !testEnv) {
      throw new Error("Firestore emulator unavailable — receipt evidence rules tests cannot skip");
    }
    void context;
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "admins", "receipt_brand"), {
        email: "brand@test.com",
        role: "brand_owner",
        name: "Brand",
      });
      await setDoc(doc(db, "admins", "receipt_owner"), {
        email: "owner@test.com",
        role: "branch_owner",
        branchId: BRANCH,
        name: "Owner",
      });
      await setDoc(doc(db, "admins", "receipt_staff"), {
        email: "staff@test.com",
        role: "branch_staff",
        branchId: BRANCH,
        name: "Staff",
      });
      for (const [uid, role] of [
        ["receipt_brand", "brand_owner"],
        ["receipt_owner", "branch_owner"],
        ["receipt_staff", "branch_staff"],
      ] as const) {
        await setDoc(doc(db, "users", uid), { role, active: true });
      }
      await setDoc(doc(db, "customers", CUSTOMER_UID), {
        customerId: CUSTOMER_UID,
        fullName: "Receipt Owner",
      });
      // Server merge-set shape: the evidence stamp lives beside the money.
      await setDoc(
        doc(db, "orders", ORDER),
        {
          customerId: CUSTOMER_UID,
          userId: CUSTOMER_UID,
          branchId: BRANCH,
          shortCode: "BG-RECEIPT",
          status: { code: "PREPARING", label: "Preparing", kind: "in_progress", terminal: false },
          orderType: "delivery",
          fulfillment: "delivery",
          items: [{ productId: "p1", name: "Burger", quantity: 1, unitPrice: 268 }],
          totals: { subtotal: 268, grandTotal: 259 },
          pricing: { foodSubtotal: 268, grandTotal: 259, discount: 0, deliveryFee: 0 },
          payment: { method: "cod", status: "pending" },
          paymentStatus: "pending",
          placedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      await setDoc(
        doc(db, "orders", ORDER),
        {
          cashCollectedPaise: 25900,
          receiptEvidence: RECEIPT_EVIDENCE,
          payment: { method: "cod", status: "completed", capturedAmountPaise: 25900 },
          paymentStatus: "paid",
        },
        { merge: true },
      );
    });
  });

  function databaseFor(uid: string) {
    if (!testEnv) throw new Error("testEnv missing");
    return testEnv.authenticatedContext(uid).firestore();
  }

  it(
    "r4-denies: no client role can change receipt evidence or the money it proves",
    { timeout: 240000 },
    async () => {
      for (const actor of ACTORS) {
        const db = databaseFor(actor.uid);
        for (const { label, patch } of EVIDENCE_PATCHES) {
          try {
            await assertFails(updateDoc(doc(db, "orders", ORDER), patch));
          } catch (err) {
            if (String(err).includes("Expected request to fail")) {
              throw new Error(`ROLE=${actor.label} was ALLOWED to change ${label}`, { cause: err });
            }
            throw err;
          }
        }
      }
    },
  );

  it("r4-allows: unrelated staff edits still succeed", { timeout: 120000 }, async () => {
    const db = databaseFor("receipt_staff");
    await assertSucceeds(updateDoc(doc(db, "orders", ORDER), { notes: "kitchen note" }));
  });

  it("r4-server: the server merge-set can stamp evidence", { timeout: 120000 }, async () => {
    if (!testEnv) throw new Error("testEnv missing");
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await assertSucceeds(
        setDoc(
          doc(db, "orders", ORDER),
          {
            cashCollectedPaise: 25900,
            receiptEvidence: RECEIPT_EVIDENCE,
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        ),
      );
      const snap = await getDoc(doc(db, "orders", ORDER));
      expect(snap.get("receiptEvidence.by")).toBe("server");
      expect(snap.get("cashCollectedPaise")).toBe(25900);
    });
  });
});
