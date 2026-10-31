/**
 * PII-01 (SEC-02) — franchise applicant data is brand-level.
 *
 * Rules commit dd97bae (synced byte-for-byte from the canonical backend file)
 * narrowed `franchise_leads` and `franchise_inquiries` read/update from
 * `isBrandOwner() || isBranchOwner()` to `isBrandOwner()` only.
 *
 * Why: `isBranchOwner()` includes `branch_staff`, so any cashier could read
 * every applicant's name, phone, email and budget. Create stays as it was —
 * an authenticated applicant can still submit (customerId bound to their uid)
 * — and delete stays brand-only.
 */
import { readFileSync } from "fs";
import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const PROJECT_ID = "burgonomics-test-rules";
const EMULATOR_PORT = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080);

const APPLICANT_UID = "cust_applicant_1";
const LEAD = "lead_1";
const INQUIRY = "inq_1";

const COLLECTIONS = ["franchise_leads", "franchise_inquiries"] as const;

const applicantPii = {
  customerId: APPLICANT_UID,
  name: "Asha Patel",
  phone: "+919800000001",
  email: "asha@example.com",
  budget: "10L-20L",
  city: "Surat",
};

describe("Firestore Security Rules — franchise applicant PII is brand-only", () => {
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
    if (testEnv) {
      await testEnv.cleanup();
    }
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
        branchId: "branch_01",
      });
      await setDoc(doc(db, "admins", "branch_staff_1"), {
        role: "branch_staff",
        branchId: "branch_01",
      });
      await setDoc(doc(db, "franchise_leads", LEAD), applicantPii);
      await setDoc(doc(db, "franchise_inquiries", INQUIRY), applicantPii);
    });
  });

  for (const collection of COLLECTIONS) {
    const docId = collection === "franchise_leads" ? LEAD : INQUIRY;

    it(`[FRANCHISE-STAFF-READ-DENY] branch_staff cannot read ${collection}`, async (context) => {
      if (!emulatorAvailable) return context.skip();
      const db = testEnv!.authenticatedContext("branch_staff_1").firestore();
      await assertFails(getDoc(doc(db, collection, docId)));
    });

    it(`[FRANCHISE-OWNER-READ-DENY] branch_owner cannot read ${collection}`, async (context) => {
      if (!emulatorAvailable) return context.skip();
      const db = testEnv!.authenticatedContext("branch_owner_1").firestore();
      await assertFails(getDoc(doc(db, collection, docId)));
    });

    it(`[FRANCHISE-BRAND-READ-ALLOW] brand_owner can read ${collection}`, async (context) => {
      if (!emulatorAvailable) return context.skip();
      const db = testEnv!.authenticatedContext("brand_owner_1").firestore();
      await assertSucceeds(getDoc(doc(db, collection, docId)));
    });

    it(`[FRANCHISE-STAFF-UPDATE-DENY] branch_staff cannot update ${collection}`, async (context) => {
      if (!emulatorAvailable) return context.skip();
      const db = testEnv!.authenticatedContext("branch_staff_1").firestore();
      await assertFails(updateDoc(doc(db, collection, docId), { budget: "20L+" }));
    });

    it(`[FRANCHISE-OWNER-UPDATE-DENY] branch_owner cannot update ${collection}`, async (context) => {
      if (!emulatorAvailable) return context.skip();
      const db = testEnv!.authenticatedContext("branch_owner_1").firestore();
      await assertFails(updateDoc(doc(db, collection, docId), { budget: "20L+" }));
    });

    it(`[FRANCHISE-BRAND-UPDATE-ALLOW] brand_owner can update ${collection}`, async (context) => {
      if (!emulatorAvailable) return context.skip();
      const db = testEnv!.authenticatedContext("brand_owner_1").firestore();
      await assertSucceeds(updateDoc(doc(db, collection, docId), { budget: "20L+" }));
    });

    it(`[FRANCHISE-APPLICANT-CREATE-ALLOW] an applicant can still submit ${collection}`, async (context) => {
      if (!emulatorAvailable) return context.skip();
      const db = testEnv!.authenticatedContext(APPLICANT_UID).firestore();
      await assertSucceeds(
        setDoc(doc(db, collection, `${docId}_new`), {
          customerId: APPLICANT_UID,
          name: "Ravi Shah",
          phone: "+919800000002",
          email: "ravi@example.com",
          budget: "5L-10L",
        }),
      );
    });

    it(`[FRANCHISE-SPOOFED-CREATE-DENY] an applicant cannot stamp another uid on ${collection}`, async (context) => {
      if (!emulatorAvailable) return context.skip();
      const db = testEnv!.authenticatedContext(APPLICANT_UID).firestore();
      await assertFails(
        setDoc(doc(db, collection, `${docId}_spoof`), {
          ...applicantPii,
          customerId: "someone_else",
        }),
      );
    });

    it(`[FRANCHISE-ANON-CREATE-DENY] unauthenticated create on ${collection} is refused`, async (context) => {
      if (!emulatorAvailable) return context.skip();
      const db = testEnv!.unauthenticatedContext().firestore();
      await assertFails(setDoc(doc(db, collection, `${docId}_anon`), applicantPii));
    });

    it(`[FRANCHISE-APPLICANT-UPDATE-DENY] applicants can no longer edit their own ${collection}`, async (context) => {
      if (!emulatorAvailable) return context.skip();
      const db = testEnv!.authenticatedContext(APPLICANT_UID).firestore();
      await assertFails(updateDoc(doc(db, collection, docId), { budget: "20L+" }));
    });

    it(`[FRANCHISE-STAFF-DELETE-DENY] branch_staff cannot delete ${collection}`, async (context) => {
      if (!emulatorAvailable) return context.skip();
      const db = testEnv!.authenticatedContext("branch_staff_1").firestore();
      await assertFails(deleteDoc(doc(db, collection, docId)));
    });

    it(`[FRANCHISE-BRAND-DELETE-ALLOW] brand_owner can delete ${collection}`, async (context) => {
      if (!emulatorAvailable) return context.skip();
      const db = testEnv!.authenticatedContext("brand_owner_1").firestore();
      await assertSucceeds(deleteDoc(doc(db, collection, docId)));
    });
  }
});
