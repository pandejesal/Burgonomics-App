import { readFileSync } from "fs";
import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteField } from "firebase/firestore";

/**
 * DEC-01 (polish Phase 3, T3.6-ROLES) —
 * "SERVER-ONLY protected order fields for ALL client roles".
 *
 * The protected order set (basket/items, pricing/payments, dispatch state,
 * POS sync, refunds, delivery-OTP proof, customer identity) may only be
 * written by the backend through the Admin SDK. Before this contract the
 * `/orders` update rule began with `if isBrandOwner() || ...`, so
 * brand_owner/developer could still patch every protected field directly;
 * the shipped rules had already removed that privilege from branch staff.
 *
 * Writer inventory (source-verified before enforcement):
 *  - Customer app ordersService.ts: createOrder -> setDoc CREATE (with items),
 *    setWhatsappOptIn -> merge {whatsappOptIn, updatedAt}, cancelOrder ->
 *    merge {status CANCELLED, completedAt}; markPaymentFailed/finalizePaidOrder
 *    are zero-write server-truth readers.
 *  - Partner useOrders.ts updateOrderStatus -> HTTP POST /orders/bumpStatus
 *    (no direct client write); adminOrdersService.ts is read-only.
 *  - Partner walk-in counter lane -> one-time CREATE with items via
 *    createOrderDocIfAbsent (ManualOrderCreateModal.tsx).
 *
 * Contract asserted here:
 *  1. NO client role — brand_owner, developer, regional_manager, branch_owner
 *     (own AND foreign), branch_staff, support, customer (owner), anonymous,
 *     claims-only staff, unrecognized role aliases — may change a protected
 *     field of an existing order, including nested/dotted patches and
 *     FieldValue.delete removals under protected maps.
 *  2. The explicitly safe scoped updates survive: operator status bumps,
 *     customer cancel + whatsapp opt-in lanes, takeaway completion for
 *     operators (delivery DELIVERED stays server-OTP-only for everyone).
 *  3. Legitimate initial CREATE with items (customer checkout and walk-in)
 *     stays allowed; POS state stays server-stamped at birth too.
 *  4. The server lane keeps full control (Admin SDK / withSecurityRulesDisabled).
 */

const PROJECT_ID = "burgonomics-test-rules";
const EMULATOR_PORT = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080);

const CUSTOMER_UID = "cust_own";
const BRANCH = "branch_01";
const FOREIGN_BRANCH = "branch_02";

const OWN_ORDER = "order_own_01";
const DELIVERY_ORDER = "order_deliver_01";
const TAKEAWAY_ORDER = "order_takeaway_01";

const TAMPERED_ITEMS = [
  { productId: "p_tamper", name: "Tampered Burger", quantity: 9, unitPrice: 1 },
];

interface RoleActor {
  label: string;
  /** authenticatedContext uid (admins doc keyed by uid unless tokenClaims used) */
  uid: string;
  /** Token claims variant: no admins doc seeded for this uid. */
  tokenClaims?: Record<string, unknown>;
  unauthenticated?: boolean;
}

const ROLE_ACTORS: RoleActor[] = [
  { label: "brand_owner(admins doc)", uid: "brand_owner_1" },
  { label: "developer(admins doc)", uid: "developer_1" },
  { label: "regional_manager(admins doc)", uid: "regional_manager_1" },
  { label: "branch_owner(own branch)", uid: "branch_owner_1" },
  { label: "branch_owner(foreign branch)", uid: "branch_owner_2" },
  { label: "branch_staff(own branch)", uid: "branch_staff_1" },
  { label: "support(admins doc)", uid: "support_1" },
  { label: "customer(order owner)", uid: CUSTOMER_UID },
  { label: "claims-only branch_staff", uid: "claims_staff", tokenClaims: { role: "branch_staff", branchIds: [BRANCH] } },
  // Literal alias roles the RBAC helpers do not recognize must fail closed:
  // an unrecognized case/spelling must not inherit anyone's write lane.
  { label: "alias Brand_Owner(unrecognized)", uid: "alias_brand_owner" },
  { label: "anonymous", uid: "anon", unauthenticated: true },
];

/**
 * Representative DEC-01 protected patches against an existing order.
 * Covers: top-level replace, nested/dotted patch, nested delete under a
 * protected map, FieldValue.delete removal, and direct writes for every
 * family in the mandate (basket, pricing, payment, dispatch, POS, refund,
 * OTP proof, tenant identity).
 */
const PROTECTED_PATCHES: Array<{ field: string; patch: Record<string, unknown> }> = [
  { field: "items", patch: { items: TAMPERED_ITEMS } },
  { field: "items.0.quantity (dotted)", patch: { "items.0.quantity": 99 } },
  { field: "totals", patch: { totals: { subtotal: 1, grandTotal: 1 } } },
  { field: "totals.grandTotal (dotted)", patch: { "totals.grandTotal": 1 } },
  { field: "pricing", patch: { pricing: { gatewayFee: 9 } } },
  { field: "pricingSnapshot", patch: { pricingSnapshot: { tampered: true } } },
  { field: "payment", patch: { payment: { method: "upi", status: "completed" } } },
  { field: "payment.status (dotted)", patch: { "payment.status": "completed" } },
  { field: "payment nested delete", patch: { "payment.status": deleteField() } },
  { field: "payment (deleteField)", patch: { payment: deleteField() } },
  { field: "paymentStatus", patch: { paymentStatus: "completed" } },
  { field: "deliveryStatus", patch: { deliveryStatus: "DELIVERED" } },
  { field: "dispatchStatus", patch: { dispatchStatus: "assigned" } },
  { field: "dispatchProvider", patch: { dispatchProvider: "borzo" } },
  { field: "dispatchOrderId", patch: { dispatchOrderId: "forged_id" } },
  { field: "borzoOrderId", patch: { borzoOrderId: "forged_id" } },
  { field: "routeTransferStatus", patch: { routeTransferStatus: "transferred" } },
  { field: "petpoojaOrderId", patch: { petpoojaOrderId: "pos_999" } },
  { field: "petpoojaStatus", patch: { petpoojaStatus: "Success" } },
  { field: "petpoojaSyncStatus", patch: { petpoojaSyncStatus: "synced" } },
  { field: "kotPrinted", patch: { kotPrinted: true } },
  { field: "refund", patch: { refund: { status: "processed" } } },
  { field: "refunds", patch: { refunds: [{ amount: 100 }] } },
  { field: "refundStatus", patch: { refundStatus: "processed" } },
  { field: "refundId", patch: { refundId: "rfn_999" } },
  { field: "refundAmount", patch: { refundAmount: 5 } },
  { field: "deliveryOtp", patch: { deliveryOtp: "1234" } },
  { field: "deliveryOtpHash", patch: { deliveryOtpHash: "forged-hash" } },
  { field: "deliveryOtpAttempts (dotted)", patch: { deliveryOtpAttempts: 0 } },
  { field: "deliveryOtpLockedUntil", patch: { deliveryOtpLockedUntil: null } },
  { field: "customerId (victim stamp)", patch: { customerId: "victim_999" } },
  { field: "userId (victim stamp)", patch: { userId: "victim_999" } },
  { field: "orderType (OTP-evasion flip)", patch: { orderType: "takeaway" } },
  // --------------------------------------------------------------------------
  // REVIEWER RED 2026-10-27 (rules review = REVISE): the denylist mechanism
  // missed every server-owned lease/claim family discovered after the list
  // was written. All names verified in backend sources:
  //  - refund claim/ledger (modules/payments/razorpay.service.ts,
  //    webhookHandler.ts): forging refundActiveClaim / refundClaimed* /
  //    refundLedger / refundedTotalPaise / refundKeyedReceipts makes refund
  //    flows refuse as already-refunded or in-progress (claimRace checks).
  //  - dispatch lease/pointer (modules/dispatch/dispatch.router.ts,
  //    porter/porter.service.ts): dispatchClaimedAt /
  //    porterDispatchClaimedAt freeze re-dispatch; dispatchPendingCorrelation
  //    / dispatchReleasedBindings / porterDispatchStatus can clear the F10
  //    guard and mint a second rider assignment.
  //  - Same class (medium): petpoojaClaimedAt / petpoojaPushClaimedAt
  //    (modules/petpooja/orderPush.ts, petpooja.scheduler.ts) and
  //    routeTransferClaimedAt (payments/routeTransfers.ts) are lease/claim
  //    stamps — a client-stamped value suppresses the real server claim.
  // --------------------------------------------------------------------------
  { field: "refundActiveClaim", patch: { refundActiveClaim: { requestId: "req_rogue", paymentId: "pay_rogue" } } },
  { field: "refundClaimedAt", patch: { refundClaimedAt: "2026-10-27T00:00:00Z" } },
  { field: "refundClaimedRequestId", patch: { refundClaimedRequestId: "req_rogue" } },
  { field: "refundClaimedPaymentId", patch: { refundClaimedPaymentId: "pay_rogue" } },
  { field: "refundClaimedPaise", patch: { refundClaimedPaise: 500 } },
  { field: "refundClaimedKey", patch: { refundClaimedKey: "key_rogue" } },
  { field: "refundClaimedReason", patch: { refundClaimedReason: "forged reason" } },
  { field: "refundLedger", patch: { refundLedger: [{ paise: 500, status: "processed" }] } },
  { field: "refundedTotalPaise", patch: { refundedTotalPaise: 500 } },
  { field: "refundKeyedReceipts", patch: { refundKeyedReceipts: { key_rogue: { paise: 500 } } } },
  { field: "dispatchClaimedAt", patch: { dispatchClaimedAt: "2026-10-27T00:00:00Z" } },
  { field: "porterDispatchClaimedAt", patch: { porterDispatchClaimedAt: "2026-10-27T00:00:00Z" } },
  { field: "dispatchPendingCorrelation", patch: { dispatchPendingCorrelation: "corr_rogue" } },
  { field: "dispatchReleasedBindings", patch: { dispatchReleasedBindings: ["bind_rogue"] } },
  { field: "porterDispatchStatus", patch: { porterDispatchStatus: "claimed" } },
  { field: "petpoojaClaimedAt", patch: { petpoojaClaimedAt: "2026-10-27T00:00:00Z" } },
  { field: "petpoojaPushClaimedAt", patch: { petpoojaPushClaimedAt: "2026-10-27T00:00:00Z" } },
  { field: "routeTransferClaimedAt", patch: { routeTransferClaimedAt: "2026-10-27T00:00:00Z" } },
  // Literal dotted-key injection: razorpay.service.ts readRecordedPaymentField
  // (~122-132) reads BOTH the nested payment map AND the legacy literal
  // top-level key named "payment.<field>"; backend webhookHandler and
  // routeTransfers read the same. The old map-equality locks only compare the
  // `payment` MAP, so planting the literal top-level dotted key (escaped-dot
  // updateDoc path -> a field literally named "payment.razorpayPaymentId")
  // changed no map value and sailed through.
  { field: "payment.razorpayPaymentId (literal dotted key)", patch: { "payment\\.razorpayPaymentId": "pay_rogue" } },
  { field: "payment.capturedPaymentId (literal dotted key)", patch: { "payment\\.capturedPaymentId": "pay_rogue" } },
];

describe("Firestore Security Rules — DEC-01 order server-only fields (all client roles)", () => {
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
      await setDoc(doc(db, "admins", "regional_manager_1"), {
        email: "regional@burgonomics.com", role: "regional_manager", name: "Regional",
      });
      await setDoc(doc(db, "admins", "branch_owner_1"), {
        email: "branch1@burgonomics.com", role: "branch_owner", branchId: BRANCH, name: "Own",
      });
      await setDoc(doc(db, "admins", "branch_owner_2"), {
        email: "branch2@burgonomics.com", role: "branch_owner", branchId: FOREIGN_BRANCH, name: "Foreign",
      });
      await setDoc(doc(db, "admins", "branch_staff_1"), {
        email: "staff1@burgonomics.com", role: "branch_staff", branchId: BRANCH, name: "Staff",
      });
      await setDoc(doc(db, "admins", "support_1"), {
        email: "support@burgonomics.com", role: "support", name: "Support",
      });
      // Literal alias fail-closed probe: a case-mangled role must not pass.
      await setDoc(doc(db, "admins", "alias_brand_owner"), {
        email: "alias@burgonomics.com", role: "Brand_Owner", name: "Alias",
      });

      await setDoc(doc(db, "customers", CUSTOMER_UID), {
        customerId: CUSTOMER_UID, fullName: "Owner Customer",
      });

      const baseOrder = {
        customerId: CUSTOMER_UID,
        userId: CUSTOMER_UID,
        branchId: BRANCH,
        status: { kind: "in_progress", code: "PREPARING", label: "Preparing", terminal: false },
        items: [{ productId: "p1", name: "Classic Burger", quantity: 2, unitPrice: 149 }],
        totals: { subtotal: 298, grandTotal: 313 },
        payment: { method: "upi", status: "pending" },
        placedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, "orders", OWN_ORDER), { ...baseOrder, orderId: OWN_ORDER });
      await setDoc(doc(db, "orders", DELIVERY_ORDER), {
        ...baseOrder, orderId: DELIVERY_ORDER, orderType: "delivery",
      });
      await setDoc(doc(db, "orders", TAKEAWAY_ORDER), {
        ...baseOrder, orderId: TAKEAWAY_ORDER, orderType: "takeaway",
      });
    });
  });

  function databaseFor(actor: RoleActor) {
    if (!testEnv) throw new Error("testEnv missing");
    if (actor.unauthenticated) return testEnv.unauthenticatedContext().firestore();
    const ctx = testEnv.authenticatedContext(
      actor.uid,
      actor.tokenClaims ? (actor.tokenClaims as Record<string, never>) : undefined,
    );
    return ctx.firestore();
  }

  // -------------------------------------------------------------------------
  // 1. THE MASK — every client role, own AND foreign, denied on protected set
  // -------------------------------------------------------------------------

  it("dec01-denies: protected repository patches are DENIED for every client role", { timeout: 240000 }, async () => {
    for (const actor of ROLE_ACTORS) {
      const db = databaseFor(actor);
      for (const { field, patch } of PROTECTED_PATCHES) {
        await assertFails(
          updateDoc(doc(db, "orders", OWN_ORDER), patch),
          `ROLE=${actor.label} must NOT patch protected field ${field}`
        );
      }
    }
  });

  it("dec01-delivery-otp: no client role can direct-DELIVER a delivery order (handover proof is server-only)", { timeout: 180000 }, async () => {
    for (const actor of ROLE_ACTORS) {
      const db = databaseFor(actor);
      await assertFails(
        updateDoc(doc(db, "orders", DELIVERY_ORDER), {
          status: { code: "DELIVERED", kind: "completed", label: "Delivered", terminal: true },
        }),
        `ROLE=${actor.label} must not direct-DELIVER a delivery order`
      );
    }
  });

  // -------------------------------------------------------------------------
  // 2. EXPLICITLY SAFE SCOPED WRITES SURVIVE (no silent role lockout)
  // -------------------------------------------------------------------------

  it("dec01-safe: operator workflow lane still bumps status (admins-doc holder)", async () => {
    const staffDb = databaseFor({ label: "branch_staff(own branch)", uid: "branch_staff_1" });
    await assertSucceeds(
      updateDoc(doc(staffDb, "orders", OWN_ORDER), {
        status: { code: "READY_FOR_PICKUP", kind: "in_progress", label: "Ready", terminal: false },
      })
    );
  });

  it("dec01-safe: claims-only branch staff (token claims, no admins doc) bumps status", async () => {
    const claimsDb = databaseFor({
      label: "claims-only branch_staff",
      uid: "claims_staff",
      tokenClaims: { role: "branch_staff", branchIds: [BRANCH] },
    });
    await assertSucceeds(
      updateDoc(doc(claimsDb, "orders", OWN_ORDER), {
        status: { code: "READY_FOR_PICKUP", kind: "in_progress", label: "Ready", terminal: false },
      })
    );
  });

  it("dec01-safe: brand_owner and developer retain masked noncritical workflow updates", { timeout: 120000 }, async () => {
    const brandDb = databaseFor({ label: "brand_owner", uid: "brand_owner_1" });
    await assertSucceeds(
      updateDoc(doc(brandDb, "orders", OWN_ORDER), {
        status: { code: "READY_FOR_PICKUP", kind: "in_progress", label: "Ready", terminal: false },
      })
    );
    const devDb = databaseFor({ label: "developer", uid: "developer_1" });
    await assertSucceeds(
      updateDoc(doc(devDb, "orders", OWN_ORDER), {
        status: { code: "PREPARING", kind: "in_progress", label: "Preparing", terminal: false },
      })
    );
  });

  it("dec01-safe: operators complete takeaway/dine-in orders in person (delivery stays OTP-only)", { timeout: 120000 }, async () => {
    const staffDb = databaseFor({ label: "branch_staff(own branch)", uid: "branch_staff_1" });
    await assertSucceeds(
      updateDoc(doc(staffDb, "orders", TAKEAWAY_ORDER), {
        status: { code: "PICKED_UP", kind: "completed", label: "Picked Up", terminal: true },
      })
    );
  });

  it("dec01-safe: foreign branch operator can still not touch another outlet's order", { timeout: 120000 }, async () => {
    const foreignDb = databaseFor({ label: "branch_owner(foreign branch)", uid: "branch_owner_2" });
    await assertFails(
      updateDoc(doc(foreignDb, "orders", OWN_ORDER), {
        status: { code: "READY_FOR_PICKUP", kind: "in_progress", label: "Ready", terminal: false },
      }),
      "Foreign branch operator cannot workflow-write another outlet's order"
    );
  });

  it("dec01-safe: alias unrecognized role is fail-closed even for safe workflow writes", { timeout: 120000 }, async () => {
    const aliasDb = databaseFor({ label: "alias Brand_Owner", uid: "alias_brand_owner" });
    await assertFails(
      updateDoc(doc(aliasDb, "orders", OWN_ORDER), {
        status: { code: "READY_FOR_PICKUP", kind: "in_progress", label: "Ready", terminal: false },
      }),
      "Recognized roles only: unrecognized role alias must fail closed"
    );
  });

  it("dec01-safe: customer cancel + whatsapp opt-in scoped lanes survive", { timeout: 120000 }, async () => {
    const custDb = databaseFor({ label: "customer(order owner)", uid: CUSTOMER_UID });
    await assertSucceeds(
      updateDoc(doc(custDb, "orders", OWN_ORDER), {
        status: { code: "CANCELLED", kind: "cancelled", label: "Cancelled", terminal: true },
        completedAt: new Date().toISOString(),
      })
    );
  });

  // -------------------------------------------------------------------------
  // 3. CREATE-WITH-ITEMS CONTRACT (not blanket-denied)
  // -------------------------------------------------------------------------

  it("dec01-create: customer checkout create-with-items still succeeds", async () => {
    const custDb = databaseFor({ label: "customer", uid: "cust_creator" });
    await assertSucceeds(
      setDoc(doc(custDb, "orders", "ord_rules_create_cust"), {
        customerId: "cust_creator",
        userId: "cust_creator",
        branchId: BRANCH,
        status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
        items: [{ productId: "p1", name: "Classic Burger", quantity: 2, unitPrice: 149 }],
        totals: { subtotal: 298, grandTotal: 313 },
        payment: { method: "online", label: "Pay Online", status: "pending" },
      })
    );
  });

  it("dec01-create: partner walk-in create-with-items still succeeds (POS state server-owned at birth)", { timeout: 120000 }, async () => {
    const staffDb = databaseFor({ label: "branch_staff(own branch)", uid: "branch_staff_1" });
    await assertSucceeds(
      setDoc(doc(staffDb, "orders", "ord_rules_create_walkin"), {
        customerId: "cust_walkin",
        userId: "branch_staff_1",
        branchId: BRANCH,
        status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
        items: [{ productId: "p1", name: "Classic Burger", quantity: 1, unitPrice: 149 }],
        paymentMethod: "cash",
        paymentStatus: "completed",
        total: 149,
      })
    );
  });

  it("dec01-create: walk-in cannot stamp POS/dispatch/refund/OTP state at birth either", { timeout: 120000 }, async () => {
    const staffDb = databaseFor({ label: "branch_staff(own branch)", uid: "branch_staff_1" });
    await assertFails(
      setDoc(doc(staffDb, "orders", "ord_rules_create_walkin_pos"), {
        customerId: "cust_walkin",
        userId: "branch_staff_1",
        branchId: BRANCH,
        status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
        items: [{ productId: "p1", name: "Classic Burger", quantity: 1, unitPrice: 149 }],
        paymentStatus: "completed",
        total: 149,
        // POS sync ledger is server-owned (petpooja ledger); a client-stamped
        // value at birth is the exact privilege this rule removes.
        petpoojaSyncStatus: "pending",
      }),
      "POS sync state is server-stamped at order birth"
    );
  });

  // -------------------------------------------------------------------------
  // 3b. REVIEWER RED 2026-10-27 — forgery AT BIRTH (both create lanes)
  //
  // The old create rule was a key DENYLIST; every lease/claim family
  // discovered after it was written (refund claim/ledger, dispatch lease
  // pointers, POS push leases, route-transfer lease) was absent from it, so
  // a client could plant them at birth. Literal dotted keys
  // ("payment.razorpayPaymentId" as a single top-level field) also sailed
  // through: 'payment' itself stayed absent, so the payment map allowlist
  // never ran, while the backend's readRecordedPaymentField treats the
  // legacy dotted literal as authoritative. The fixed rule is an ALLOWLIST
  // over exactly the keys the two writer audits plant — everything else,
  // dotted or not, is rejected.
  // -------------------------------------------------------------------------

  const EXPLOIT_CREATE_KEYS: Array<{ field: string; value: unknown }> = [
    { field: "refundActiveClaim", value: { requestId: "req_rogue", paymentId: "pay_rogue" } },
    { field: "refundClaimedAt", value: "2026-10-27T00:00:00Z" },
    { field: "refundClaimedRequestId", value: "req_rogue" },
    { field: "refundClaimedPaymentId", value: "pay_rogue" },
    { field: "refundClaimedPaise", value: 500 },
    { field: "refundClaimedKey", value: "key_rogue" },
    { field: "refundClaimedReason", value: "forged reason" },
    { field: "refundLedger", value: [{ paise: 500, status: "processed" }] },
    { field: "refundedTotalPaise", value: 500 },
    { field: "refundKeyedReceipts", value: { key_rogue: { paise: 500 } } },
    { field: "dispatchClaimedAt", value: "2026-10-27T00:00:00Z" },
    { field: "porterDispatchClaimedAt", value: "2026-10-27T00:00:00Z" },
    { field: "dispatchPendingCorrelation", value: "corr_rogue" },
    { field: "dispatchReleasedBindings", value: ["bind_rogue"] },
    { field: "porterDispatchStatus", value: "claimed" },
    { field: "petpoojaClaimedAt", value: "2026-10-27T00:00:00Z" },
    { field: "petpoojaPushClaimedAt", value: "2026-10-27T00:00:00Z" },
    { field: "routeTransferClaimedAt", value: "2026-10-27T00:00:00Z" },
  ];

  function customerCreateBase(): Record<string, unknown> {
    return {
      customerId: "cust_creator",
      userId: "cust_creator",
      branchId: BRANCH,
      status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
      items: [{ productId: "p1", name: "Classic Burger", quantity: 2, unitPrice: 149 }],
      totals: { subtotal: 298, grandTotal: 313 },
      payment: { method: "online", label: "Pay Online", status: "pending" },
    };
  }

  function walkInCreateBase(staffUid: string): Record<string, unknown> {
    // Compliant walk-in payload (partner owner is removing petpoojaSyncStatus
    // from ManualOrderCreateModal; the field is forbidden at birth either way).
    return {
      customerId: "cust_walkin",
      userId: staffUid,
      branchId: BRANCH,
      status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
      items: [{ productId: "p1", name: "Classic Burger", quantity: 1, unitPrice: 149 }],
      paymentMethod: "cash",
      paymentStatus: "completed",
      total: 149,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  it("dec09-create: lease/claim families cannot be planted at birth on the CUSTOMER lane", { timeout: 240000 }, async () => {
    const custDb = databaseFor({ label: "customer", uid: "cust_creator" });
    for (const { field, value } of EXPLOIT_CREATE_KEYS) {
      await assertFails(
        setDoc(doc(custDb, "orders", `ord_exploit_cust_${field.replace(/\W+/g, "_")}`), {
          ...customerCreateBase(),
          [field]: value,
        }),
        `field ${field} must be server-stamped, never planted at order birth`
      );
    }
  });

  it("dec09-create: lease/claim families cannot be planted at birth on the WALK-IN lane", { timeout: 240000 }, async () => {
    const staffDb = databaseFor({ label: "branch_staff(own branch)", uid: "branch_staff_1" });
    for (const { field, value } of EXPLOIT_CREATE_KEYS) {
      await assertFails(
        setDoc(doc(staffDb, "orders", `ord_exploit_walkin_${field.replace(/\W+/g, "_")}`), {
          ...walkInCreateBase("branch_staff_1"),
          [field]: value,
        }),
        `field ${field} must be server-stamped, never planted at order birth`
      );
    }
  });

  it("dec09-create: literal dotted keys (payment.razorpayPaymentId shape) cannot be planted at birth on either lane", { timeout: 240000 }, async () => {
    // Escaped-dot updateDoc-style key -> a field literally named
    // "payment.razorpayPaymentId" (single top-level scalar, no `payment`
    // map present). Backend readRecordedPaymentField reads that legacy
    // literal as authoritative, so creation-time planting must be DENIED.
    const custDb = databaseFor({ label: "customer", uid: "cust_creator" });
    await assertFails(
      setDoc(doc(custDb, "orders", "ord_exploit_cust_dotted_pay"), {
        ...customerCreateBase(),
        "payment\\.razorpayPaymentId": "pay_rogue",
      }),
      "literal dotted payment binding is server-owned"
    );
    const staffDb = databaseFor({ label: "branch_staff(own branch)", uid: "branch_staff_1" });
    await assertFails(
      setDoc(doc(staffDb, "orders", "ord_exploit_walkin_dotted_pay"), {
        ...walkInCreateBase("branch_staff_1"),
        "payment\\.capturedPaymentId": "pay_rogue",
      }),
      "literal dotted payment binding is server-owned"
    );
  });

  // -------------------------------------------------------------------------
  // 4. SERVER CONTROL (Admin SDK / withSecurityRulesDisabled positive control)
  // -------------------------------------------------------------------------

  it("dec01-server: server writes (Admin SDK bypass) keep full authority over protected fields", async () => {
    await testEnv!.withSecurityRulesDisabled(async (writerContext) => {
      const db = writerContext.firestore();
      await setDoc(
        doc(db, "orders", OWN_ORDER),
        {
          items: [{ productId: "p_server", name: "Server Corrected Burger", quantity: 1, unitPrice: 149 }],
          deliveryStatus: "ASSIGNED",
          refundStatus: "processed",
        },
        { merge: true },
      );
      const snap = await getDoc(doc(db, "orders", OWN_ORDER));
      expect((snap.data() as Record<string, unknown>)["deliveryStatus"]).toBe("ASSIGNED");
      expect((snap.data() as Record<string, unknown>)["refundStatus"]).toBe("processed");
    });
  });

  // -------------------------------------------------------------------------
  // 5. READ SCOPING sanity for the actors used above
  // -------------------------------------------------------------------------

  it("dec01-read: order owner reads own order, foreign customer cannot", async () => {
    const custDb = databaseFor({ label: "customer(order owner)", uid: CUSTOMER_UID });
    await assertSucceeds(getDoc(doc(custDb, "orders", OWN_ORDER)));
    const intruderDb = databaseFor({ label: "anonymous", uid: "anon", unauthenticated: true });
    await assertFails(getDoc(doc(intruderDb, "orders", OWN_ORDER)));
  });
});
