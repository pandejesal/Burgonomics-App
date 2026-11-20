import { readFileSync } from "fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";

/**
 * COUPON AUTHORITY + franchise settlement — the client boundary is CLOSED.
 *
 * Cycle 2 moved the coupon authority onto the server (audit 2026-11-20 §1.6)
 * and added the month-end settlement statements. Both live in the same rules
 * region, and both were previously unproven at the rules layer:
 *
 *  - `coupons` used to be `allow read: if true`, so any unauthenticated scraper
 *    could enumerate every code, discount value and cap. It is now server-only.
 *  - `coupon_redemptions` / `coupon_stats` / `coupon_customer_usage` are the
 *    atomicity ledgers behind the cap and the per-customer limit; a client that
 *    could write them could forge or replay a redemption.
 *  - `coupon_issues` is the staff issue trail; a brand owner reads it, nobody
 *    writes it from a client.
 *  - `branch_settlements` / `settlement_versions` are server-written month-end
 *    statements: a brand owner reads every branch, a branch owner only its own.
 *
 * WHAT THE APPS ACTUALLY READ (source-verified before writing this suite, so the
 * "allowed" assertions below are the apps' real contract, not a guess):
 *
 *  - Customer: `/coupons/available` (GET) and `/coupons/quote` (POST) over the
 *    authenticated Functions API (src/features/offers/services/offersService.ts).
 *    It never touches a coupon collection directly.
 *  - Partner: `/coupons/list`, `/coupons/usage`, `/coupons/create`,
 *    `/coupons/active`, `/coupons/issue` via partnerFunctionsApi. The coupon
 *    manager screen (AdminCouponsPage) and the settlement screen
 *    (hooks/useSettlements.ts) are API-only; neither has a Firestore listener.
 *    The `coupons` field on a customer profile is an array INSIDE `users/{uid}`,
 *    not a document in the `coupons` collection.
 *
 * So there is NO client path that needs to read `coupons`, `coupon_redemptions`,
 * `coupon_stats` or `coupon_customer_usage`, and denying every role is the
 * intended end state rather than a regression. `coupon_issues` keeps its
 * brand-owner read because the console renders that issue trail.
 *
 * The last case is a positive CONTROL: the public catalogue collections the
 * customer app really does read anonymously (`offers`, `combos`,
 * `recommendations`) must stay world-readable, so a future blanket deny in this
 * region cannot pass unnoticed.
 */

const PROJECT_ID = "burgonomics-test-rules";
const EMULATOR_PORT = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080);

const CUSTOMER_UID = "customer_1";
const BRAND_OWNER_UID = "brand_owner_1";
const BRANCH_OWNER_1_UID = "branch_owner_1";
const BRANCH_OWNER_2_UID = "branch_owner_2";
const SUPPORT_UID = "support_1";

const COUPON_CODE = "WELCOME10";
const REDEMPTION_ID = "ord_001";
const USAGE_ID = "usage_1";
const ISSUE_ID = "issue_1";
const SETTLEMENT_1 = "branch_01_2026-11_v001";
const SETTLEMENT_2 = "branch_02_2026-11_v001";
const VERSION_1 = "2026-11_v001";

const PUBLIC_COUPON = {
  code: COUPON_CODE,
  title: "Welcome",
  discountType: "percent",
  value: 10,
  minOrder: 199,
  totalCap: 500,
  perCustomerLimit: 1,
  active: true,
};

describe("Firestore Security Rules — coupon authority and settlements are server-only", () => {
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

    // The fixtures are written with rules DISABLED: these documents are
    // exactly what the server writes through the Admin SDK, and a client
    // could never create them once the rules below are in force.
    await testEnv.withSecurityRulesDisabled(async (writerContext) => {
      const db = writerContext.firestore();

      // F06: staff authorization is fail-closed on `users/{uid}.active`, so
      // every privileged actor needs an ACTIVE profile document.
      for (const [uid, role] of [
        [BRAND_OWNER_UID, "brand_owner"],
        [BRANCH_OWNER_1_UID, "branch_owner"],
        [BRANCH_OWNER_2_UID, "branch_owner"],
        [SUPPORT_UID, "support"],
      ] as const) {
        await setDoc(doc(db, "users", uid), { role, active: true });
      }
      // The legacy `admins/{uid}` registry is the other arm `hasRole` reads,
      // and ownsBranch compares its branchId, so it must carry the tenancy.
      await setDoc(doc(db, "admins", BRAND_OWNER_UID), {
        role: "brand_owner",
        email: "brand@burgonomics.com",
      });
      await setDoc(doc(db, "admins", BRANCH_OWNER_1_UID), {
        role: "branch_owner",
        branchId: "branch_01",
      });
      await setDoc(doc(db, "admins", BRANCH_OWNER_2_UID), {
        role: "branch_owner",
        branchId: "branch_02",
      });
      await setDoc(doc(db, "admins", SUPPORT_UID), { role: "support" });

      await setDoc(doc(db, "coupons", COUPON_CODE), PUBLIC_COUPON);
      await setDoc(doc(db, "coupon_redemptions", REDEMPTION_ID), {
        code: COUPON_CODE,
        customerId: CUSTOMER_UID,
        orderId: REDEMPTION_ID,
        discountPaise: 5000,
      });
      await setDoc(doc(db, "coupon_stats", COUPON_CODE), {
        code: COUPON_CODE,
        redeemed: 1,
        cappedOut: false,
      });
      await setDoc(doc(db, "coupon_customer_usage", USAGE_ID), {
        code: COUPON_CODE,
        customerId: CUSTOMER_UID,
        uses: 1,
      });
      await setDoc(doc(db, "coupon_issues", ISSUE_ID), {
        code: COUPON_CODE,
        customerId: CUSTOMER_UID,
        issuedBy: BRAND_OWNER_UID,
      });

      await setDoc(doc(db, "branch_settlements", SETTLEMENT_1), {
        branchId: "branch_01",
        monthKey: "2026-11",
        version: 1,
        netPayablePaise: 128000,
        paid: false,
      });
      await setDoc(doc(db, "branch_settlements", SETTLEMENT_2), {
        branchId: "branch_02",
        monthKey: "2026-11",
        version: 1,
        netPayablePaise: 96000,
        paid: false,
      });
      await setDoc(doc(db, "settlement_versions", VERSION_1), {
        monthKey: "2026-11",
        versions: 1,
      });

      // Public catalogue — the customer app reads these anonymously.
      await setDoc(doc(db, "offers", "offer_1"), {
        title: "Combo week",
        active: true,
      });
      await setDoc(doc(db, "combos", "combo_1"), {
        title: "Family meal",
        active: true,
      });
      await setDoc(doc(db, "recommendations", "rec_1"), {
        title: "Try the chicken",
        active: true,
      });
    });
  });

  const anon = () => testEnv!.unauthenticatedContext().firestore();
  const asUser = (uid: string) => testEnv!.authenticatedContext(uid).firestore();

  it("1. [COUPON-ANON-READ-DENY] an unauthenticated scraper cannot enumerate coupons", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const db = anon();

    await assertFails(getDoc(doc(db, "coupons", COUPON_CODE)));
    // The breaking case: the old rule was `allow read: if true`, so a LIST
    // walked every code, discount and cap without any auth at all.
    await assertFails(getDocs(collection(db, "coupons")));
  });

  it("2. [COUPON-CUSTOMER-READ-DENY] a signed-in customer cannot read the coupon documents", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const db = asUser(CUSTOMER_UID);

    await assertFails(getDoc(doc(db, "coupons", COUPON_CODE)));
    await assertFails(getDocs(collection(db, "coupons")));
  });

  it("3. [COUPON-BRAND-READ-DENY] even a brand owner reads coupons only through the server API", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const db = asUser(BRAND_OWNER_UID);
    const supportDb = asUser(SUPPORT_UID);

    await assertFails(getDoc(doc(db, "coupons", COUPON_CODE)));
    await assertFails(getDocs(collection(db, "coupons")));
    await assertFails(getDoc(doc(supportDb, "coupons", COUPON_CODE)));
  });

  it("4. [COUPON-CLIENT-WRITE-DENY] no client role can write, update or re-price a coupon", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const customerDb = asUser(CUSTOMER_UID);
    const brandDb = asUser(BRAND_OWNER_UID);

    // A customer minting a 100%-off coupon for itself.
    await assertFails(
      setDoc(doc(customerDb, "coupons", "FORGED100"), {
        ...PUBLIC_COUPON,
        code: "FORGED100",
        value: 100,
      }),
    );
    // A customer re-pricing a real coupon.
    await assertFails(updateDoc(doc(customerDb, "coupons", COUPON_CODE), { value: 100 }));
    // A brand owner also cannot write: the server is the only writer.
    await assertFails(updateDoc(doc(brandDb, "coupons", COUPON_CODE), { active: false }));
    await assertFails(
      setDoc(doc(brandDb, "coupons", "NEWCODE"), { ...PUBLIC_COUPON, code: "NEWCODE" }),
    );
  });

  it("5. [COUPON-REDEMPTION-CLIENT-DENY] the redemption ledger cannot be forged or replayed", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const customerDb = asUser(CUSTOMER_UID);
    const brandDb = asUser(BRAND_OWNER_UID);

    await assertFails(getDoc(doc(customerDb, "coupon_redemptions", REDEMPTION_ID)));
    await assertFails(
      setDoc(doc(customerDb, "coupon_redemptions", "ord_forged"), {
        code: COUPON_CODE,
        customerId: CUSTOMER_UID,
        orderId: "ord_forged",
        discountPaise: 99000,
      }),
    );
    await assertFails(getDoc(doc(brandDb, "coupon_redemptions", REDEMPTION_ID)));
    await assertFails(
      updateDoc(doc(brandDb, "coupon_redemptions", REDEMPTION_ID), { discountPaise: 0 }),
    );
  });

  it("6. [COUPON-STATS-CLIENT-DENY] the cap and per-customer counters are unwritable and unreadable", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const customerDb = asUser(CUSTOMER_UID);
    const brandDb = asUser(BRAND_OWNER_UID);

    await assertFails(getDoc(doc(customerDb, "coupon_stats", COUPON_CODE)));
    // Clearing the cap counter would defeat the total cap entirely.
    await assertFails(
      updateDoc(doc(customerDb, "coupon_stats", COUPON_CODE), { redeemed: 0, cappedOut: false }),
    );
    await assertFails(
      setDoc(doc(brandDb, "coupon_stats", "NEWCODE"), { code: "NEWCODE", redeemed: 0 }),
    );

    await assertFails(getDoc(doc(customerDb, "coupon_customer_usage", USAGE_ID)));
    // Deleting one's own usage row would re-open the per-customer limit.
    await assertFails(
      setDoc(doc(customerDb, "coupon_customer_usage", USAGE_ID), {
        code: COUPON_CODE,
        customerId: CUSTOMER_UID,
        uses: 0,
      }),
    );
    await assertFails(getDoc(doc(brandDb, "coupon_customer_usage", USAGE_ID)));
  });

  it("7. [COUPON-ISSUE-READ-ALLOW] the console's own issue trail stays readable to a brand owner", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const brandDb = asUser(BRAND_OWNER_UID);

    // This is the ONE read this region deliberately keeps: the AdminCustomerProfile
    // "Promo Coupons" tab renders the issue trail for a brand role.
    const snap = await assertSucceeds(getDoc(doc(brandDb, "coupon_issues", ISSUE_ID)));
    expect(snap.data()?.code).toBe(COUPON_CODE);
    await assertSucceeds(getDocs(collection(brandDb, "coupon_issues")));
  });

  it("8. [COUPON-ISSUE-NON-BRAND-DENY] customers, support and branch owners cannot read or write issues", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const customerDb = asUser(CUSTOMER_UID);
    const supportDb = asUser(SUPPORT_UID);
    const branchDb = asUser(BRANCH_OWNER_1_UID);

    await assertFails(getDoc(doc(customerDb, "coupon_issues", ISSUE_ID)));
    await assertFails(getDoc(doc(supportDb, "coupon_issues", ISSUE_ID)));
    await assertFails(getDoc(doc(branchDb, "coupon_issues", ISSUE_ID)));

    const brandDb = asUser(BRAND_OWNER_UID);
    // The issue trail is append-only server state; even a brand owner cannot mint it.
    await assertFails(
      setDoc(doc(brandDb, "coupon_issues", "issue_forged"), {
        code: COUPON_CODE,
        customerId: CUSTOMER_UID,
      }),
    );
    await assertFails(updateDoc(doc(brandDb, "coupon_issues", ISSUE_ID), { code: "OTHER" }));
  });

  it("9. [SETTLEMENT-BRAND-READ-ALLOW] a brand owner reads every branch statement and its version list", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const brandDb = asUser(BRAND_OWNER_UID);

    await assertSucceeds(getDoc(doc(brandDb, "branch_settlements", SETTLEMENT_1)));
    await assertSucceeds(getDoc(doc(brandDb, "branch_settlements", SETTLEMENT_2)));
    await assertSucceeds(getDocs(collection(brandDb, "branch_settlements")));
    await assertSucceeds(getDoc(doc(brandDb, "settlement_versions", VERSION_1)));
  });

  it("10. [SETTLEMENT-BRANCH-SCOPE] a branch operator reads only its own branch and cannot write either", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const b1Db = asUser(BRANCH_OWNER_1_UID);

    await assertSucceeds(getDoc(doc(b1Db, "branch_settlements", SETTLEMENT_1)));
    // Cross-branch read is the leak this block exists to prevent.
    await assertFails(getDoc(doc(b1Db, "branch_settlements", SETTLEMENT_2)));
    // Versions are brand-level only.
    await assertFails(getDoc(doc(b1Db, "settlement_versions", VERSION_1)));

    // A branch owner must not be able to mark its own statement paid.
    await assertFails(updateDoc(doc(b1Db, "branch_settlements", SETTLEMENT_1), { paid: true }));
    await assertFails(
      setDoc(doc(b1Db, "branch_settlements", "branch_01_2026-12_v001"), {
        branchId: "branch_01",
        monthKey: "2026-12",
        version: 1,
        netPayablePaise: 1,
        paid: true,
      }),
    );
  });

  it("11. [COUPON-PUBLIC-CATALOGUE-STILL-READS] the catalogue the customer app reads anonymously is still allowed", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const db = anon();

    // firestoreService.getFeaturedOffers / getPopularCombos / getRecommendations
    // read these anonymously on the home screen, so a blanket deny in the
    // coupon region would break the storefront while looking like a security win.
    await assertSucceeds(getDoc(doc(db, "offers", "offer_1")));
    await assertSucceeds(getDoc(doc(db, "combos", "combo_1")));
    await assertSucceeds(getDoc(doc(db, "recommendations", "rec_1")));
  });
});
