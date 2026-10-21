import { readFileSync } from "fs";
import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
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
  arrayUnion,
  deleteField,
  Timestamp,
} from "firebase/firestore";

/**
 * Lane 07 — ticket resolution lease must be server-owned.
 *
 * functions/src/modules/tickets/tickets.service.ts owns a resolution lease on
 * support_tickets/{id} (and the legacy tickets/{id} mirror):
 *   resolutionClaim = { actorUid: string|null, claimedAt: <ms epoch> }
 * written inside the claim transaction (claimTicketResolution), fenced on
 * commit (commitResolvedTicket compares claim.claimedAt) and deleted on
 * success/release. RESOLUTION_CLAIM_TTL_MS = 2.5 min.
 *
 * A client that can write resolutionClaim can (a) plant a fresh claim and lock
 * every staff member out of resolving that ticket for the TTL, or (b) clear a
 * live claim, aborting the in-flight resolver's fenced commit. The brand-owner
 * update arm (`allow update: if isBrandOwner() || ...`) carried NO field mask,
 * so the whole lease contract was client-writable.
 *
 * Same mask on both arms: a direct client update may advance workflow only
 * (status/resolution/assignedTo/timeline/lastActivityAt/updatedAt). Money
 * actions, identity/tenant fields and the server lease stay server-only.
 */

const PROJECT_ID = "burgonomics-test-rules";
const EMULATOR_PORT = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080);

const TICKET_ID = "sup_lease_1";
const LEGACY_ID = "tkt_lease_1";
const WORKFLOW_MASK_KEYS = [
  "status",
  "resolution",
  "assignedTo",
  "timeline",
  "lastActivityAt",
  "updatedAt",
];

describe("Firestore Security Rules — ticket resolution lease is server-owned", () => {
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
      // Silent skips let RBAC rules rot green forever (Loop 9). There is NO
      // CI job for rules in this repo (see .github/workflows/): the gate is
      // the manual `node scripts/test-rules.mjs` (Firestore emulator), so
      // never quote a local run without naming the emulator command.
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
      await setDoc(doc(db, "admins", "brand_owner_1"), {
        role: "brand_owner",
        email: "brand@burgonomics.com",
      });
      // Dual-role fixture: plain admins-doc branch authority PLUS a brand
      // claim, so one caller reaches both update arms.
      await setDoc(doc(db, "admins", "dual_role_1"), {
        role: "branch_owner",
        branchId: "branch_01",
      });
      await setDoc(doc(db, "admins", "branch_owner_1"), {
        role: "branch_owner",
        branchId: "branch_01",
      });
      await setDoc(doc(db, "admins", "branch_owner_2"), {
        role: "branch_owner",
        branchId: "branch_02",
      });
      const base = {
        ticketNumber: "TKT-LEASE-1",
        subject: "Refund not received",
        category: "payment_refund",
        branchId: "branch_01",
        customerId: "cust_100",
        status: "open",
        timeline: [],
      };
      await setDoc(doc(db, "support_tickets", TICKET_ID), base);
      await setDoc(doc(db, "tickets", LEGACY_ID), base);
    });
  });

  it("1. [LEASE-CLAIM-INJECT-DENY] brand authority cannot plant a resolutionClaim", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const brandDb = testEnv!.authenticatedContext("brand_owner_1").firestore();

    // Shape the server writes in claimTicketResolution().
    await assertFails(
      updateDoc(doc(brandDb, "support_tickets", TICKET_ID), {
        resolutionClaim: { actorUid: "brand_owner_1", claimedAt: Date.now() },
      }),
    );
  });

  it("2. [LEASE-CLAIM-CLEAR-DENY] brand authority cannot clear a live lease", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const brandDb = testEnv!.authenticatedContext("brand_owner_1").firestore();

    // A live claim as the server left it (unexpired).
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "support_tickets", TICKET_ID), {
        resolutionClaim: { actorUid: "branch_owner_1", claimedAt: Date.now() },
      });
    });

    await assertFails(
      updateDoc(doc(brandDb, "support_tickets", TICKET_ID), {
        resolutionClaim: { actorUid: "brand_owner_1", claimedAt: Date.now() - 10 * 60 * 1000 },
      }),
    );
  });

  it("3. [LEASE-MONEY-ACTION-DENY] brand authority cannot fabricate the server's money-audit resolution MAP", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const brandDb = testEnv!.authenticatedContext("brand_owner_1").firestore();

    // The server writes `resolution` as a map (tickets.service.ts:769-778:
    // action/amount/refundResult/resolvedBy/resolvedByName/notes/resolvedAt).
    // A byte-for-byte fake that the money never paid would render as a real
    // refund in the partner UI and then block the genuine resolve with
    // TICKET_ALREADY_RESOLVED. Client writes stay string-only.
    // NOTE: payload carries ONLY the map + updatedAt, so this assertFails
    // fails for exactly the resolution-shape guard and nothing else.
    await assertFails(
      updateDoc(doc(brandDb, "support_tickets", TICKET_ID), {
        resolution: {
          action: "full_refund",
          amount: 349,
          refundResult: { refundId: "rfnd_fake", success: true },
          resolvedBy: "brand_owner_1",
          resolvedByName: "Brand Owner",
          notes: "refunded",
          resolvedAt: Date.now(),
        },
        updatedAt: Timestamp.now(),
      }),
    );
  });

  it("3b. [LEASE-MONEY-STRING-ALLOW] the client still may record a plain-text resolution", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const brandDb = testEnv!.authenticatedContext("brand_owner_1").firestore();

    await assertSucceeds(
      updateDoc(doc(brandDb, "support_tickets", TICKET_ID), {
        status: "in_progress",
        resolution: "investigating with the branch",
        updatedAt: Timestamp.now(),
      }),
    );
  });

  it("4. [LEASE-TENANT-RESTAMP-DENY] brand authority cannot re-stamp the ticket's branch or customer", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const brandDb = testEnv!.authenticatedContext("brand_owner_1").firestore();

    await assertFails(
      updateDoc(doc(brandDb, "support_tickets", TICKET_ID), {
        branchId: "branch_02",
        customerId: "cust_999",
      }),
    );
  });

  it("5. [LEASE-WORKFLOW-ALLOW] brand authority can still advance workflow fields", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const brandDb = testEnv!.authenticatedContext("brand_owner_1").firestore();

    await assertSucceeds(
      updateDoc(doc(brandDb, "support_tickets", TICKET_ID), {
        status: "in_progress",
        resolution: "investigating with the branch",
        assignedTo: { tier: "branch" },
        timeline: arrayUnion({ action: "note_added", message: "brand follow-up" }),
        lastActivityAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
    );
  });

  it("6. [LEASE-TIMELINE-FALLBACK-ALLOW] the real client fallback payload still passes on both collections", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const brandDb = testEnv!.authenticatedContext("brand_owner_1").firestore();

    // useTicket.ts addMessage legacy fallback: timeline + updatedAt only.
    await assertSucceeds(
      updateDoc(doc(brandDb, "support_tickets", TICKET_ID), {
        timeline: arrayUnion({ action: "message_added", message: "hello" }),
        updatedAt: Timestamp.now(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(brandDb, "tickets", LEGACY_ID), {
        timeline: arrayUnion({ action: "message_added", message: "hello" }),
        updatedAt: Timestamp.now(),
      }),
    );
  });

  it("7. [LEASE-BRANCH-OWN-BATCH-ALLOW] branch staff keep their scoped workflow path", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const branchDb = testEnv!.authenticatedContext("branch_owner_1").firestore();

    await assertSucceeds(
      updateDoc(doc(branchDb, "support_tickets", TICKET_ID), {
        status: "in_progress",
        timeline: arrayUnion({ action: "note_added", message: "branch picked it up" }),
        updatedAt: Timestamp.now(),
      }),
    );
  });

  it("8. [LEASE-BRANCH-CROSS-DENY] a foreign branch operator still cannot touch the ticket", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const foreignDb = testEnv!.authenticatedContext("branch_owner_2").firestore();

    await assertFails(
      updateDoc(doc(foreignDb, "support_tickets", TICKET_ID), {
        status: "in_progress",
        updatedAt: Timestamp.now(),
      }),
    );
  });

  it("9. [LEASE-DENIED-WRITE-LEAVES-NO-CLAIM] a refused injection mutates nothing", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const brandDb = testEnv!.authenticatedContext("brand_owner_1").firestore();

    await assertFails(
      updateDoc(doc(brandDb, "support_tickets", TICKET_ID), {
        resolutionClaim: { actorUid: "brand_owner_1", claimedAt: Date.now() },
      }),
    );

    const check: { stored?: Record<string, any> } = {};
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDoc(doc(ctx.firestore(), "support_tickets", TICKET_ID));
      check.stored = snap.data() ?? {};
    });
    if (!check.stored) {
      throw new Error("ticket doc vanished during the denied-write check");
    }
    // The lease stays absent — the refused write must not materialise it.
    if ("resolutionClaim" in check.stored) {
      throw new Error(`resolutionClaim leaked into the doc: ${JSON.stringify(check.stored.resolutionClaim)}`);
    }
  });

  it("10. [LEASE-MASK-CONTRACT] the workflow mask is exactly the client-advance set", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const brandDb = testEnv!.authenticatedContext("brand_owner_1").firestore();

    // Every mask key is individually writable by brand authority.
    for (const key of WORKFLOW_MASK_KEYS) {
      const value =
        key === "timeline"
          ? arrayUnion({ action: "note_added", message: `mask ${key}` })
          : key === "assignedTo"
            ? { tier: "developer_team" }
            : key === "lastActivityAt" || key === "updatedAt"
              ? Timestamp.now()
              : key === "status"
                ? "in_progress"
                : "mask check";
      await assertSucceeds(
        updateDoc(doc(brandDb, "support_tickets", TICKET_ID), { [key]: value }),
      );
    }
  });

  it("11. [LEASE-DELETEFIELD-DENY] the workflow mask cannot be satisfied by erasure", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const brandDb = testEnv!.authenticatedContext("brand_owner_1").firestore();

    // affectedKeys() includes REMOVED keys, so deleteField() used to pass the
    // hasOnly boundary and erase the server audit trail / status from inside
    // the mask. removedKeys() is what closes it. The erasure vector needs the
    // field to EXIST: deleting an absent key is a pure no-op (change nothing,
    // then pin that non-mutation too).
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "support_tickets", TICKET_ID), {
        resolution: "seeded client workflow text",
        timeline: [{ action: "seeded", message: "existing audit row" }],
      });
    });

    await assertFails(
      updateDoc(doc(brandDb, "support_tickets", TICKET_ID), { timeline: deleteField() }),
    );
    await assertFails(
      updateDoc(doc(brandDb, "support_tickets", TICKET_ID), { status: deleteField() }),
    );
    await assertFails(
      updateDoc(doc(brandDb, "support_tickets", TICKET_ID), { resolution: deleteField() }),
    );
    // Absent field -> no affectedKeys entry at all -> no-op success by design.
    await assertSucceeds(
      updateDoc(doc(brandDb, "support_tickets", TICKET_ID), { assignedTo: deleteField() }),
    );

    const check: { stored?: Record<string, any> } = {};
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDoc(doc(ctx.firestore(), "support_tickets", TICKET_ID));
      check.stored = snap.data() ?? {};
    });
    if (!check.stored) {
      throw new Error("ticket doc vanished during the erasure check");
    }
    if (check.stored.status !== "open") {
      throw new Error(`status was mutated by denied writes: ${check.stored.status}`);
    }
    if (check.stored.resolution !== "seeded client workflow text") {
      throw new Error(`resolution was mutated by denied writes: ${check.stored.resolution}`);
    }
    if (check.stored.timeline?.length !== 1) {
      throw new Error(`timeline was mutated by denied writes: ${JSON.stringify(check.stored.timeline)}`);
    }
  });

  it("12. [LEASE-TERMINAL-STATUS-DENY] a client cannot close the book (status resolved/closed)", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const brandDb = testEnv!.authenticatedContext("brand_owner_1").firestore();

    // Only the server resolve/escalate routes set terminal states; a fake
    // 'resolved' would render as a done ticket with no server action run and
    // would then block the genuine resolve with TICKET_ALREADY_RESOLVED.
    // 'closed' hits the same status chokepoint at tickets.service.ts:494/644.
    await assertFails(
      updateDoc(doc(brandDb, "support_tickets", TICKET_ID), {
        status: "resolved",
        updatedAt: Timestamp.now(),
      }),
    );
    await assertFails(
      updateDoc(doc(brandDb, "support_tickets", TICKET_ID), {
        status: "closed",
        updatedAt: Timestamp.now(),
      }),
    );
    await assertFails(
      updateDoc(doc(brandDb, "support_tickets", TICKET_ID), { status: { code: "resolved" } }),
    );
  });

  it("13. [LEASE-LEGACY-DENY] the same lease is bound on the legacy tickets mirror", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const brandDb = testEnv!.authenticatedContext("brand_owner_1").firestore();

    await assertFails(
      updateDoc(doc(brandDb, "tickets", LEGACY_ID), {
        resolutionClaim: { actorUid: "brand_owner_1", claimedAt: Date.now() },
      }),
    );
    // Isolated resolution-map deny (no terminal status in this payload — the
    // status enum has its own test 12).
    await assertFails(
      updateDoc(doc(brandDb, "tickets", LEGACY_ID), {
        resolution: {
          action: "full_refund",
          amount: 349,
          refundResult: { refundId: "rfnd_fake", success: true },
        },
        updatedAt: Timestamp.now(),
      }),
    );
  });

  it("14. [LEASE-DUAL-ROLE-DENY] a caller matching BOTH arms is still bounded by the shared mask", async (context) => {
    if (!emulatorAvailable) return context.skip();
    // admins doc role branch_owner (branch_01) while the ID token carries
    // role brand_owner. ownsBranch() short-circuits on the brand claim, so
    // this caller reaches both arm shapes — the identical helper is the only
    // thing that keeps the bound.
    const dualDb = testEnv!
      .authenticatedContext("dual_role_1", { role: "brand_owner", branchIds: ["branch_01"] })
      .firestore();

    await assertFails(
      updateDoc(doc(dualDb, "support_tickets", TICKET_ID), {
        resolutionClaim: { actorUid: "dual_role_1", claimedAt: Date.now() },
      }),
    );
    await assertFails(
      updateDoc(doc(dualDb, "support_tickets", TICKET_ID), {
        status: "resolved",
        resolution: { action: "full_refund", amount: 349 },
        updatedAt: Timestamp.now(),
      }),
    );
    // and a plain workflow write must still pass for the same caller
    await assertSucceeds(
      updateDoc(doc(dualDb, "support_tickets", TICKET_ID), {
        status: "in_progress",
        updatedAt: Timestamp.now(),
      }),
    );

    // Probe that the brand CLAIM is live (not just the branch doc): reads of
    // payment_audits are isBrandOwner()-only. A branch-only caller cannot read
    // this, so the dual shape is actually two-capability, not two arms of one.
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "payment_audits", "probe_dual"), {
        seeded: true,
      });
    });
    await assertSucceeds(
      getDoc(doc(dualDb, "payment_audits", "probe_dual")),
    );
  });

  it("15. [LEASE-ASSIGNEDTO-SHAPE-DENY] only a well-formed single-tier map passes", async (context) => {
    if (!emulatorAvailable) return context.skip();
    const brandDb = testEnv!.authenticatedContext("brand_owner_1").firestore();

    // Genealogy: every deny here is attributable to the assignedTo clause
    // alone (remove the guard and at least one of these writes would pass).
    await assertFails(
      updateDoc(doc(brandDb, "support_tickets", TICKET_ID), { assignedTo: "branch" }),
    );
    await assertFails(
      updateDoc(doc(brandDb, "support_tickets", TICKET_ID), {
        assignedTo: { tier: "branch", staffId: "u_1" },
      }),
    );
    await assertFails(
      updateDoc(doc(brandDb, "support_tickets", TICKET_ID), { assignedTo: { assignee: "u_1" } }),
    );
    await assertFails(
      updateDoc(doc(brandDb, "support_tickets", TICKET_ID), { assignedTo: { tier: "root" } }),
    );
    await assertFails(
      updateDoc(doc(brandDb, "support_tickets", TICKET_ID), { assignedTo: {} }),
    );
  });
});
