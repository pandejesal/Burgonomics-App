import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, collection, addDoc } from "firebase/firestore";

/**
 * Rules-hardening lane (independent audit, 4 Nov 2026).
 *
 * Four LOW hygiene gaps were reported. None was an active exploit, but each
 * granted a privilege nothing in the product uses, so each is closed here and
 * pinned by a test that would fail if it were re-opened:
 *
 *  F1 `admin_stores/{id}` create was open to ANY branch operator for ANY store
 *     id, with no key allowlist, while the doc is publicly readable.
 *  F2 The "server-owned" order deny list declared financial fields immutable but
 *     omitted the legacy money fields (total/subtotal/tax/â€¦), so branch staff
 *     could rewrite them on an already-settled order.
 *  F3 A chat participant could forge `senderId`/`senderName`/`senderRole` on a
 *     message, so a customer could post as "Burgonomics Support".
 *  F4 `franchise_leads`/`franchise_inquiries` create had no field allowlist, so
 *     an applicant could plant `status: "approved"` at birth.
 *
 * Every assertion below is the attack that must now FAIL plus the legitimate
 * write that must still SUCCEED, so the rules cannot be tightened into breakage.
 */

const PROJECT_ID = "burgonomics-test-rules";
const RULES_PATH = resolve(__dirname, "../../firestore.rules");

const CUSTOMER_UID = "cust_rules_own";
const FOREIGN_UID = "cust_rules_other";
const BRANCH = "branch_01";
const FOREIGN_BRANCH = "branch_02";
const STAFF_UID = "staff_branch_01";
const BRAND_UID = "brand_owner_1";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(RULES_PATH, "utf8") },
  });
});

afterAll(async () => {
  if (env) await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // Staff identity lives in `admins/{uid}` (rules read role + branchId there).
    await setDoc(doc(db, "admins", STAFF_UID), {
      role: "branch_staff",
      branchId: BRANCH,
      email: "staff@fixture.test",
    });
    await setDoc(doc(db, "admins", BRAND_UID), {
      role: "brand_owner",
      email: "brand@fixture.test",
    });
    await setDoc(doc(db, "orders", "order_paid_01"), {
      customerId: CUSTOMER_UID,
      userId: CUSTOMER_UID,
      branchId: BRANCH,
      status: "delivered",
      orderType: "delivery",
      fulfillment: "delivery",
      total: 263,
      subtotal: 250,
      tax: 13,
      paymentMethod: "razorpay",
      pricing: { grandTotal: 263 },
      payment: { status: "paid", razorpayPaymentId: "pay_fixture" },
      items: [{ productId: "p1", name: "Fixture Burger", quantity: 1, unitPrice: 250 }],
    });
    // A thread both users already belong to, so message writes are the subject.
    await setDoc(doc(db, "chats", "chat_pair_01"), {
      type: "direct",
      participantIds: [CUSTOMER_UID, FOREIGN_UID],
      participantNames: ["Customer", "Other"],
      lastMessageText: "",
      lastMessageSender: "",
      lastMessageAt: null,
      updatedAt: null,
    });
  });
});

// Production ID tokens always carry a `role` custom claim (the rules read
// request.auth.token.role directly in hasRole, so an emulator token without it
// is not a faithful fixture). Each context therefore mirrors the real claim.
const staffDb = () =>
  env.authenticatedContext(STAFF_UID, { role: "branch_staff" }).firestore();
const brandDb = () =>
  env.authenticatedContext(BRAND_UID, { role: "brand_owner" }).firestore();
const customerDb = () =>
  env.authenticatedContext(CUSTOMER_UID, { role: "customer" }).firestore();

// ---------------------------------------------------------------------------
// F1 â€” admin_stores
// ---------------------------------------------------------------------------
describe("F1 admin_stores create is not an unscoped staff privilege", () => {
  it("DENIES a branch_staff create for a foreign store id", async () => {
    await assertFails(
      setDoc(doc(staffDb(), "admin_stores", "store_99"), {
        title: "Injected",
        branchId: FOREIGN_BRANCH,
        meta: { arbitrary: true },
      }),
    );
  });

  it("DENIES an arbitrary-field payload even for the staffer's own branch", async () => {
    await assertFails(
      setDoc(doc(staffDb(), "admin_stores", BRANCH), {
        title: "Own branch but invented shape",
        branchId: BRANCH,
        meta: { arbitrary: true },
      }),
    );
  });

  it("still allows a brand owner to create a store", async () => {
    await assertSucceeds(
      setDoc(doc(brandDb(), "admin_stores", "store_new"), {
        title: "New outlet",
        branchId: "branch_new",
      }),
    );
  });

  it("still allows public read (guest store discovery depends on it)", async () => {
    const guest = env.unauthenticatedContext().firestore();
    await assertSucceeds(
      setDoc(doc(env.withSecurityRulesDisabled ? brandDb() : brandDb(), "admin_stores", "store_read"), {
        title: "Readable",
        branchId: BRANCH,
      }),
    );
    const { getDoc } = await import("firebase/firestore");
    await assertSucceeds(getDoc(doc(guest, "admin_stores", "store_read")));
  });
});

// ---------------------------------------------------------------------------
// F2 â€” legacy money fields on an existing order
// ---------------------------------------------------------------------------
describe("F2 legacy money fields are server-owned on an existing order", () => {
  const moneyKeys = [
    ["total", 0.01],
    ["subtotal", 0],
    ["tax", 0],
    ["deliveryFee", 0],
    ["tipAmount", 0],
    ["paymentMethod", "cash"],
    ["loyaltyPointsRedeemed", 999],
    ["deliveryQuoteId", "quote_forged"],
  ] as const;

  for (const [key, value] of moneyKeys) {
    it(`DENIES branch_staff rewriting ${key}`, async () => {
      await assertFails(
        updateDoc(doc(staffDb(), "orders", "order_paid_01"), { [key]: value }),
      );
    });
  }

  it("DENIES a promo rewrite", async () => {
    await assertFails(
      updateDoc(doc(staffDb(), "orders", "order_paid_01"), { promo: { code: "FREE100" } }),
    );
  });

  it("DENIES the same rewrite by a brand owner (no privileged bypass)", async () => {
    await assertFails(updateDoc(doc(brandDb(), "orders", "order_paid_01"), { total: 0.01 }));
  });

  it("still allows the customer's own whatsapp opt-in lane", async () => {
    await assertSucceeds(
      updateDoc(doc(customerDb(), "orders", "order_paid_01"), { whatsappOptIn: true }),
    );
  });
});

// ---------------------------------------------------------------------------
// F3 â€” chat message sender identity
// ---------------------------------------------------------------------------
describe("F3 a chat message cannot forge its sender identity", () => {
  const legit = (over: Record<string, unknown> = {}) => ({
    chatId: "chat_pair_01",
    senderId: CUSTOMER_UID,
    senderName: "Customer",
    senderRole: "customer",
    text: "hello",
    imageUrl: null,
    orderReference: null,
    ticketReference: null,
    createdAt: new Date(),
    readBy: [CUSTOMER_UID],
    ...over,
  });

  it("DENIES a message attributed to a different uid", async () => {
    await assertFails(
      addDoc(
        collection(customerDb(), "chats", "chat_pair_01", "messages"),
        legit({ senderId: FOREIGN_UID, senderName: "Branch Manager", senderRole: "branch_staff" }),
      ),
    );
  });

  it("DENIES a message that impersonates support with its own uid but a staff role", async () => {
    await assertFails(
      addDoc(
        collection(customerDb(), "chats", "chat_pair_01", "messages"),
        legit({ senderName: "Burgonomics Support", senderRole: "brand_owner" }),
      ),
    );
  });

  it("DENIES a branch_staff sender claiming a brand role", async () => {
    // The staffer belongs to the thread via participantIds.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "chats", "chat_pair_01"), {
        participantIds: [CUSTOMER_UID, FOREIGN_UID, STAFF_UID],
      });
    });
    await assertFails(
      addDoc(
        collection(staffDb(), "chats", "chat_pair_01", "messages"),
        legit({ senderId: STAFF_UID, senderName: "Support", senderRole: "brand_owner", readBy: [STAFF_UID] }),
      ),
    );
  });

  it("still allows a branch_staff sender claiming their real role", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "chats", "chat_pair_01"), {
        participantIds: [CUSTOMER_UID, FOREIGN_UID, STAFF_UID],
      });
    });
    await assertSucceeds(
      addDoc(
        collection(staffDb(), "chats", "chat_pair_01", "messages"),
        legit({ senderId: STAFF_UID, senderName: "Staff", senderRole: "branch_staff", readBy: [STAFF_UID] }),
      ),
    );
  });

  it("DENIES extra planted fields", async () => {
    await assertFails(
      addDoc(collection(customerDb(), "chats", "chat_pair_01", "messages"), {
        ...legit(),
        isSystem: true,
        verified: true,
      }),
    );
  });

  it("still allows a genuine participant message with the real payload shape", async () => {
    await assertSucceeds(
      addDoc(collection(customerDb(), "chats", "chat_pair_01", "messages"), legit()),
    );
  });

  it("still allows a brand owner to reply as themselves", async () => {
    // The brand owner must be in the thread to post into it.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "chats", "chat_pair_01"), {
        participantIds: [CUSTOMER_UID, FOREIGN_UID, BRAND_UID],
      });
    });
    await assertSucceeds(
      addDoc(
        collection(brandDb(), "chats", "chat_pair_01", "messages"),
        legit({ senderId: BRAND_UID, senderName: "Brand", senderRole: "brand_owner", readBy: [BRAND_UID] }),
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// F4 â€” franchise lead shape
// ---------------------------------------------------------------------------
describe("F4 franchise leads cannot be born approved", () => {
  const applicant = (over: Record<string, unknown> = {}) => ({
    customerId: CUSTOMER_UID,
    name: "Applicant",
    email: "applicant@fixture.test",
    phone: "+910000000000",
    city: "Pune",
    message: "Interested",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  });

  it("DENIES a lead carrying a decided status", async () => {
    await assertFails(
      setDoc(doc(customerDb(), "franchise_leads", "lead_1"), applicant({ status: "approved" })),
    );
  });

  it("DENIES a lead planting an approval flag", async () => {
    await assertFails(
      setDoc(doc(customerDb(), "franchise_leads", "lead_2"), applicant({ isApproved: true })),
    );
  });

  it("still allows a plain applicant payload", async () => {
    await assertSucceeds(
      setDoc(doc(customerDb(), "franchise_leads", "lead_3"), applicant()),
    );
  });

  it("still allows a plain franchise_inquiries payload", async () => {
    await assertSucceeds(
      setDoc(doc(customerDb(), "franchise_inquiries", "inq_1"), applicant()),
    );
  });

  it("DENIES an inquiry planting an approval flag", async () => {
    await assertFails(
      setDoc(doc(customerDb(), "franchise_inquiries", "inq_2"), applicant({ isApproved: true })),
    );
  });
});
