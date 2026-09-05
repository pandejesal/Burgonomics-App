import { readFileSync } from "fs";
import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection } from "firebase/firestore";

const PROJECT_ID = "burgonomics-test-rules";

describe("Firestore Security Rules — CRM Hierarchy & RBAC (18 Tests)", () => {
  let testEnv: RulesTestEnvironment | null = null;
  let emulatorAvailable = false;

  beforeAll(async () => {
    try {
      testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
          rules: readFileSync("firestore.rules", "utf8"),
          host: "127.0.0.1",
          port: 8080,
        },
      });
      emulatorAvailable = true;
    } catch {
      console.warn("Firestore Emulator is not running on 127.0.0.1:8080. Skipping rules integration tests.");
      emulatorAvailable = false;
    }
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async (context) => {
    if (!emulatorAvailable || !testEnv) {
      // Silent skips let RBAC rules rot green forever (Loop 9): in CI the
      // emulator job must run — fail hard instead of skipping.
      if (process.env.CI === "true") {
        throw new Error(
          "Firestore emulator unavailable in CI — the rules job must start it (see .github/workflows/ci.yml `rules` job)."
        );
      }
      context.skip();
      return;
    }

    await testEnv.clearFirestore();

    // Seed administrative users & baseline data using withSecurityRulesDisabled
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      // Brand Owner Admin Doc
      await setDoc(doc(db, "admins", "brand_owner_1"), {
        email: "brand@burgonomics.com",
        role: "brand_owner",
        name: "Yash Brand Owner",
      });

      // Branch Owner 1 (Branch 01) Admin Doc
      await setDoc(doc(db, "admins", "branch_owner_1"), {
        email: "branch1@burgonomics.com",
        role: "branch_owner",
        branchId: "branch_01",
        name: "Navrangpura Operator",
      });

      // Branch Owner 2 (Branch 02) Admin Doc
      await setDoc(doc(db, "admins", "branch_owner_2"), {
        email: "branch2@burgonomics.com",
        role: "branch_owner",
        branchId: "branch_02",
        name: "Nehrunagar Operator",
      });

      // Existing Customer
      await setDoc(doc(db, "customers", "cust_100"), {
        customerId: "cust_100",
        fullName: "Rahul Patel",
        phone: "+919876543210",
        loyaltyPoints: 250,
      });

      // Existing Branch 01
      await setDoc(doc(db, "branches", "branch_01"), {
        name: "Burgonomics Navrangpura",
        city: "Ahmedabad",
        status: "active",
      });

      // Existing Order at Branch 01
      await setDoc(doc(db, "orders", "order_501"), {
        orderId: "order_501",
        customerId: "cust_100",
        branchId: "branch_01",
        status: { kind: "in_progress", code: "PREPARING" },
        totals: { grandTotal: 349 },
        placedAt: new Date().toISOString(),
      });

      // Existing App Settings
      await setDoc(doc(db, "app_settings", "pricing"), {
        gstRate: 0.05,
        packingCharge: 20,
      });

      // 1:1 chat thread with stamped participants (writers must set these —
      // message reads are participant-gated, not admin-wide)
      await setDoc(doc(db, "chats", "branch_01_brand_owner_1"), {
        participantIds: ["branch_owner_1", "brand_owner_1"],
        branchId: "branch_01",
      });
    });
  });

  // =========================================================================
  // 1. Anonymous Access Tests (5 cases)
  // =========================================================================

  it("1. [ANON-DENY] Anonymous request to read orders is DENIED", async () => {
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauthedDb, "orders", "order_501")));
  });

  it("2. [ANON-DENY] Anonymous request to read customer profile is DENIED", async () => {
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauthedDb, "customers", "cust_100")));
  });

  it("3. [ANON-DENY] Anonymous request to read admin profile is DENIED", async () => {
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauthedDb, "admins", "brand_owner_1")));
  });

  it("4. [ANON-DENY] Anonymous request to write payment audit is DENIED", async () => {
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(unauthedDb, "paymentAudits", "audit_999"), {
        orderId: "order_501",
        branchId: "branch_01",
        discrepancy: 50,
      })
    );
  });

  it("5. [ANON-ALLOW] Anonymous request to read public branches is ALLOWED", async () => {
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(unauthedDb, "branches", "branch_01")));
  });

  // =========================================================================
  // 2. Customer Scoping & Loyalty Global Tests (5 cases)
  // =========================================================================

  it("6. [CUSTOMER-READ-OWN] Customer can read their own order", async () => {
    const custDb = testEnv.authenticatedContext("cust_100").firestore();
    await assertSucceeds(getDoc(doc(custDb, "orders", "order_501")));
  });

  it("7. [CUSTOMER-CROSS-READ-DENY] Customer cannot read another customer's order", async () => {
    const intruderDb = testEnv.authenticatedContext("cust_999").firestore();
    await assertFails(getDoc(doc(intruderDb, "orders", "order_501")));
  });

  it("8. [CUSTOMER-LOYALTY-READ] Customer can read their own global loyalty points", async () => {
    const custDb = testEnv.authenticatedContext("cust_100").firestore();
    const snap = await getDoc(doc(custDb, "customers", "cust_100"));
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.loyaltyPoints).toBe(250);
  });

  it("9. [CUSTOMER-LOYALTY-MUTATION-DENY] Customer cannot directly modify loyalty points", async () => {
    const custDb = testEnv.authenticatedContext("cust_100").firestore();
    await assertFails(
      updateDoc(doc(custDb, "customers", "cust_100"), {
        loyaltyPoints: 99999,
      })
    );
  });

  it("10. [CUSTOMER-CREATE-ORDER] Customer can create pending order for self", async () => {
    const custDb = testEnv.authenticatedContext("cust_100").firestore();
    await assertSucceeds(
      setDoc(doc(custDb, "orders", "order_new_1"), {
        orderId: "order_new_1",
        customerId: "cust_100",
        branchId: "branch_01",
        paymentStatus: "Pending",
        totals: { grandTotal: 499 },
      })
    );
  });

  // =========================================================================
  // 3. Branch Scoping & ownsBranch Tests (4 cases)
  // =========================================================================

  it("11. [BRANCH-OWNS-READ] Branch Owner of branch_01 can read orders at branch_01", async () => {
    const branch1Db = testEnv.authenticatedContext("branch_owner_1").firestore();
    await assertSucceeds(getDoc(doc(branch1Db, "orders", "order_501")));
  });

  it("12. [BRANCH-CROSS-READ-DENY] Branch Owner of branch_02 CANNOT read orders at branch_01", async () => {
    const branch2Db = testEnv.authenticatedContext("branch_owner_2").firestore();
    await assertFails(getDoc(doc(branch2Db, "orders", "order_501")));
  });

  it("13. [BRANCH-STATUS-UPDATE] Branch Owner of branch_01 can update order status at branch_01", async () => {
    const branch1Db = testEnv.authenticatedContext("branch_owner_1").firestore();
    await assertSucceeds(
      updateDoc(doc(branch1Db, "orders", "order_501"), {
        status: { kind: "in_progress", code: "READY_FOR_PICKUP" },
      })
    );
  });

  it("14. [BRANCH-MUTATE-TOTALS-DENY] Branch Owner cannot tamper with order totals or pricing", async () => {
    const branch1Db = testEnv.authenticatedContext("branch_owner_1").firestore();
    await assertFails(
      updateDoc(doc(branch1Db, "orders", "order_501"), {
        totals: { grandTotal: 9999 },
      })
    );
  });

  // =========================================================================
  // 4. Upcoming Branches & Brand Owner Privileges (2 cases)
  // =========================================================================

  it("15. [BRAND-CREATE-UPCOMING] Brand Owner CAN create upcoming branches (Q10)", async () => {
    const brandDb = testEnv.authenticatedContext("brand_owner_1").firestore();
    await assertSucceeds(
      setDoc(doc(brandDb, "branches", "branch_upcoming_03"), {
        name: "Burgonomics South Bopal",
        city: "Ahmedabad",
        status: "upcoming",
        expectedOpenDate: "2026-11-01",
      })
    );
  });

  it("16. [BRANCH-CREATE-UPCOMING-DENY] Branch Owner CANNOT create upcoming branches (Q10)", async () => {
    const branch1Db = testEnv.authenticatedContext("branch_owner_1").firestore();
    await assertFails(
      setDoc(doc(branch1Db, "branches", "branch_upcoming_04"), {
        name: "Burgonomics Rogue Store",
        city: "Ahmedabad",
        status: "upcoming",
      })
    );
  });

  // =========================================================================
  // 5. 1:1 Direct Chat Scoping & Payment Audit Immutability (2 cases)
  // =========================================================================

  it("17. [CHAT-PAIR-ALLOW] Branch Owner 1 and Brand Owner CAN message in their pair", async () => {
    const pairId = "branch_01_brand_owner_1";
    const branch1Db = testEnv.authenticatedContext("branch_owner_1").firestore();
    await assertSucceeds(
      setDoc(doc(branch1Db, "chats", pairId, "messages", "msg_001"), {
        senderId: "branch_owner_1",
        text: "Stock delivered for today",
        createdAt: new Date().toISOString(),
      })
    );

    const brandDb = testEnv.authenticatedContext("brand_owner_1").firestore();
    await assertSucceeds(getDoc(doc(brandDb, "chats", pairId, "messages", "msg_001")));

    // Participant staffer reads its own thread even without brand role.
    const branch1ReaderDb = testEnv.authenticatedContext("branch_owner_1").firestore();
    await assertSucceeds(getDoc(doc(branch1ReaderDb, "chats", pairId, "messages", "msg_001")));
  });

  it("18. [CHAT-CROSS-DENY] Branch Owner 2 CANNOT access messages for Branch 1 pair", async () => {
    const pairId = "branch_01_brand_owner_1";
    const branch2Db = testEnv.authenticatedContext("branch_owner_2").firestore();
    await assertFails(getDoc(doc(branch2Db, "chats", pairId, "messages", "msg_001")));
  });
});
