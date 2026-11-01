import { readFileSync } from "fs";
import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
} from "firebase/firestore";

/**
 * N09 — Notification server-owned paths are default-deny at the rules layer.
 *
 * Backend inventory (source-verified, READONLY):
 *  - functions/src/modules/notifications/devicePrefs.ts
 *      -> users/{uid}/device_prefs/{installationId}  (read + transactional set)
 *  - functions/src/modules/notifications/sendGate.ts
 *      -> notification_quarantine/{nq_<sha>}         (merge set on violation)
 *      -> writeAuditLog action "notification_admin_sends"  (admin_audit_logs)
 *  - functions/src/modules/tickets/supportNotifications.ts
 *      -> notification_dispatch/{attemptId}          (attempt ledger)
 *  - fcmClient.ts / fcm.service.ts -> users/{uid}/notifications (inbox rows)
 *
 * All writes happen through the Admin SDK (bypasses rules). Device
 * preferences leak which devices belong to which accounts (and their
 * category toggles), quarantine/dispatch hold forensic send state — so NO
 * client role (brand_owner/developer included) may read or write them.
 *
 * Firestore rules are OR-of-all-matching-allow semantics: `if false` here is
 * an explicit, reviewable guardrail, not a hard block. The REAL proof is the
 * absence of any overlapping allow — which is exactly what this suite asserts
 * (every role, own and foreign, must be denied).
 *
 * Preserved (explicitly required router contract): users/{uid}/notifications
 * remains owner-scoped for the OWNER's realtime routing lane — own-doc read
 * plus read-receipt updates. NOTE (corrected 2026-10-27, reviewer finding):
 * the /users/{uid} block's read rule ALSO retains the pre-existing
 * `|| isAdmin()` read for brand roles across other accounts' inboxes —
 * that admin read predates this work and is NOT claimed by this suite; the
 * denial matrix below asserts only that the server-only collections and
 * the device lane stay closed to every client role.
 */

const PROJECT_ID = "burgonomics-test-rules";
const EMULATOR_PORT = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080);

const USER_UID = "pref_owner_u1";
const FOREIGN_UID = "pref_owner_u2";
const INSTALLATION_ID = "installation_a";

const ROLE_ACTORS: Array<{ label: string; uid: string; unauthenticated?: boolean }> = [
  { label: "brand_owner", uid: "brand_owner_1" },
  { label: "developer", uid: "developer_1" },
  { label: "support", uid: "support_1" },
  { label: "owner user", uid: USER_UID },
  { label: "anonymous", uid: "anon", unauthenticated: true },
];

describe("Firestore Security Rules — N09 notification server-only paths", () => {
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
      console.warn(`Firestore Emulator is not running on 127.0.0.1:${EMULATOR_PORT}. Skipping rules integration tests.`);
      emulatorAvailable = false;
    }
  });

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  beforeEach(async (context) => {
    if (!emulatorAvailable || !testEnv) {
      if (process.env.CI === "true") {
        throw new Error("Firestore emulator unavailable in CI — the rules job must start it.");
      }
      context.skip();
      return;
    }

    await testEnv.clearFirestore();

    await testEnv.withSecurityRulesDisabled(async (writerContext) => {
      const db = writerContext.firestore();

      await setDoc(doc(db, "admins", "brand_owner_1"), {
        email: "brand@burgonomics.com", role: "brand_owner", name: "Brand",
      });
      await setDoc(doc(db, "admins", "developer_1"), {
        email: "dev@burgonomics.com", role: "developer", name: "Developer",
      });
      await setDoc(doc(db, "admins", "support_1"), {
        email: "support@burgonomics.com", role: "support", name: "Support",
      });

      await setDoc(doc(db, "users", USER_UID), {
        fullName: "Prefs Owner", fcmTokens: ["tok_a"],
      });
      await setDoc(doc(db, "users", FOREIGN_UID), {
        fullName: "Prefs Foreign", fcmTokens: [" tok_b"],
      });

      // Backend-shaped server docs (devicePrefs.ts / sendGate.ts /
      // supportNotifications.ts) seeded so deniable reads don't hide behind
      // "document missing anyway".
      await setDoc(doc(db, "users", USER_UID, "device_prefs", INSTALLATION_ID), {
        installationId: INSTALLATION_ID,
        categories: { offers: true, orderUpdates: true, announcements: true, supportReplies: true },
        syncedAt: new Date().toISOString(),
      });
      await setDoc(doc(db, "users", FOREIGN_UID, "device_prefs", INSTALLATION_ID), {
        installationId: INSTALLATION_ID,
        categories: { offers: false, orderUpdates: true, announcements: true, supportReplies: false },
        syncedAt: new Date().toISOString(),
      });

      await setDoc(doc(db, "notification_quarantine", "nq_seed"), {
        reason: "unknown_purpose",
        purpose: "offer.blast",
        recipientUid: USER_UID,
        tokenPrefix: "tok_abcd",
        updatedAt: new Date().toISOString(),
      });
      await setDoc(doc(db, "notification_dispatch", "attempt_seed"), {
        attemptId: "attempt_seed",
        ownerUid: USER_UID,
        role: "customer",
        branchIds: [],
        createdAt: new Date().toISOString(),
      });

      await setDoc(doc(db, "users", USER_UID, "notifications", "notif_1"), {
        userId: USER_UID,
        title: "Order update",
        body: "Your order is being prepared.",
        read: false,
      });
      await setDoc(doc(db, "admin_audit_logs", "admin_log_seed"), {
        actorUid: "brand_owner_1",
        action: "notification_admin_sends",
        targetType: "customer_device",
        targetId: USER_UID,
      });
    });
  });

  function databaseFor(actor: { uid: string; unauthenticated?: boolean }) {
    if (!testEnv) throw new Error("testEnv missing");
    if (actor.unauthenticated) return testEnv.unauthenticatedContext().firestore();
    return testEnv.authenticatedContext(actor.uid).firestore();
  }

  // -------------------------------------------------------------------------
  // 1. users/{uid}/device_prefs/{installationId} — no client lane at all
  // -------------------------------------------------------------------------

  it("n09-prefs: every role is denied READ on own and foreign device_prefs", { timeout: 120000 }, async () => {
    for (const actor of ROLE_ACTORS) {
      const db = databaseFor(actor);
      await assertFails(
        getDoc(doc(db, "users", USER_UID, "device_prefs", INSTALLATION_ID)),
        `ROLE=${actor.label} must not read OWN account device_prefs`
      );
      await assertFails(
        getDoc(doc(db, "users", FOREIGN_UID, "device_prefs", INSTALLATION_ID)),
        `ROLE=${actor.label} must not read FOREIGN account device_prefs`
      );
      await assertFails(
        getDocs(collection(db, "users", USER_UID, "device_prefs")),
        `ROLE=${actor.label} must not list device_prefs`
      );
    }
  });

  it("n09-prefs: every role is denied WRITE on device_prefs regardless of ownership", { timeout: 120000 }, async () => {
    for (const actor of ROLE_ACTORS) {
      const db = databaseFor(actor);
      await assertFails(
        setDoc(doc(db, "users", USER_UID, "device_prefs", INSTALLATION_ID), {
          installationId: INSTALLATION_ID,
          categories: { offers: true, orderUpdates: false, announcements: true, supportReplies: true },
        }),
        `ROLE=${actor.label} must not write own device_prefs (suppression forge)`
      );
      await assertFails(
        updateDoc(doc(db, "users", FOREIGN_UID, "device_prefs", INSTALLATION_ID), {
          "categories.orderUpdates": false,
        }),
        `ROLE=${actor.label} must not patch foreign device_prefs`
      );
    }
  });

  // -------------------------------------------------------------------------
  // 2. notification_quarantine + notification_dispatch — server-only ledgers
  // -------------------------------------------------------------------------

  it("n09-quarantine: read+write denied for every role on notification_quarantine", { timeout: 120000 }, async () => {
    for (const actor of ROLE_ACTORS) {
      const db = databaseFor(actor);
      await assertFails(getDoc(doc(db, "notification_quarantine", "nq_seed")), `ROLE=${actor.label} quarantine read`);
      await assertFails(getDocs(collection(db, "notification_quarantine")), `ROLE=${actor.label} quarantine list`);
      await assertFails(
        setDoc(doc(db, "notification_quarantine", "nq_forged"), { reason: "none", body: "sneaked" }),
        `ROLE=${actor.label} quarantine write`
      );
    }
  });

  it("n09-dispatch: read+write denied for every role on notification_dispatch", { timeout: 120000 }, async () => {
    for (const actor of ROLE_ACTORS) {
      const db = databaseFor(actor);
      await assertFails(getDoc(doc(db, "notification_dispatch", "attempt_seed")), `ROLE=${actor.label} dispatch read`);
      await assertFails(getDocs(collection(db, "notification_dispatch")), `ROLE=${actor.label} dispatch list`);
      await assertFails(
        setDoc(doc(db, "notification_dispatch", "attempt_forged"), { ownerUid: USER_UID, token: "tok" }),
        `ROLE=${actor.label} dispatch write`
      );
    }
  });

  // -------------------------------------------------------------------------
  // 3. notification_admin_sends audit trail lives in admin_audit_logs —
  //    append-only, server-written, brand read-only.
  // -------------------------------------------------------------------------

  it("n09-audit: admin_audit_logs stays server-written (brand read-only, clients append nothing)", { timeout: 120000 }, async () => {
    const brandDb = databaseFor({ uid: "brand_owner_1" });
    await assertSucceeds(getDoc(doc(brandDb, "admin_audit_logs", "admin_log_seed")));
    for (const actor of ROLE_ACTORS) {
      const db = databaseFor(actor);
      await assertFails(
        setDoc(doc(db, "admin_audit_logs", "admin_log_forged"), {
          action: "notification_admin_sends", actorUid: "brand_owner_1", targetId: USER_UID,
        }),
        `ROLE=${actor.label} must not fabricate a notification_admin_sends audit row`
      );
    }
  });

  // -------------------------------------------------------------------------
  // 4. No cascade: scoped grants on users/{uid} must NOT open the prefs
  //    subcollection, and the parent READ the apps need stays intact.
  // -------------------------------------------------------------------------

  it("n09-cascade: brand can still read the users/{uid} profile doc, but device_prefs under it stays denied", async () => {
    const brandDb = databaseFor({ uid: "brand_owner_1" });
    await assertSucceeds(getDoc(doc(brandDb, "users", USER_UID)));
    await assertFails(getDoc(doc(brandDb, "users", USER_UID, "device_prefs", INSTALLATION_ID)));
  });

  // -------------------------------------------------------------------------
  // 5. PRESERVED contract: users/{uid}/notifications own-only routing lane
  // -------------------------------------------------------------------------

  it("n09-inbox: users/{uid}/notifications own read + read-receipt update survive", async () => {
    const ownerDb = databaseFor({ uid: USER_UID });
    await assertSucceeds(getDoc(doc(ownerDb, "users", USER_UID, "notifications", "notif_1")));
    await assertSucceeds(
      updateDoc(doc(ownerDb, "users", USER_UID, "notifications", "notif_1"), {
        read: true,
        readAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    );
  });

  it("n09-inbox: foreign user cannot read another user's notifications (no account leakage)", async () => {
    const foreignDb = databaseFor({ uid: FOREIGN_UID });
    await assertFails(getDoc(doc(foreignDb, "users", USER_UID, "notifications", "notif_1")));
  });

  it("n09-inbox: client creates of notifications stay server-only; server control unchanged", { timeout: 120000 }, async () => {
    const ownerDb = databaseFor({ uid: USER_UID });
    await assertFails(
      setDoc(doc(ownerDb, "users", USER_UID, "notifications", "notif_forged"), {
        userId: USER_UID, title: "self-serve", body: "spoofed",
      }),
      "notification inbox rows are server-minted"
    );
    await testEnv!.withSecurityRulesDisabled(async (writerContext) => {
      const db = writerContext.firestore();
      await setDoc(doc(db, "users", USER_UID, "device_prefs", INSTALLATION_ID), {
        installationId: INSTALLATION_ID,
        categories: { offers: false, orderUpdates: true, announcements: true, supportReplies: true },
        syncedAt: new Date().toISOString(),
      });
      await setDoc(doc(db, "notification_dispatch", "attempt_server"), {
        attemptId: "attempt_server", ownerUid: USER_UID, createdAt: new Date().toISOString(),
      });
      const prefs = await getDoc(doc(db, "users", USER_UID, "device_prefs", INSTALLATION_ID));
      expect(prefs.exists()).toBe(true);
    });
  });
});
