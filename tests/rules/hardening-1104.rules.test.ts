import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, collection, addDoc, getDoc, getDocs } from "firebase/firestore";
import { Timestamp } from "firebase/firestore";

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
    // F06: staff authorization is fail-closed on `users/{uid}.active`. Every
    // operator fixture therefore needs an ACTIVE profile document; a missing
    // one now denies (behavioural F06 cases live in users-fcm-tokens.rules.test.ts).
    await setDoc(doc(db, "users", STAFF_UID), { role: "branch_staff", active: true });
    await setDoc(doc(db, "users", BRAND_UID), { role: "brand_owner", active: true });
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
const staffDb = () => env.authenticatedContext(STAFF_UID, { role: "branch_staff" }).firestore();
const brandDb = () => env.authenticatedContext(BRAND_UID, { role: "brand_owner" }).firestore();
const customerDb = () => env.authenticatedContext(CUSTOMER_UID, { role: "customer" }).firestore();

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
      setDoc(
        doc(env.withSecurityRulesDisabled ? brandDb() : brandDb(), "admin_stores", "store_read"),
        {
          title: "Readable",
          branchId: BRANCH,
        },
      ),
    );
    const { getDoc } = await import("firebase/firestore");
    await assertSucceeds(getDoc(doc(guest, "admin_stores", "store_read")));
  });
});

// ---------------------------------------------------------------------------
// F17 — admin_stores / admin_stores_private privacy split
// ---------------------------------------------------------------------------
// The anonymous collection used to hold the kitchen roster, compliance
// documents, manager contacts, Petpooja webhook metadata, queue counters and
// financial analytics. Those now live in a brand-only companion document, and
// every brand write to the public document must be a FULL, shape-validated
// replacement - which is exactly how legacy PII gets removed from an already
// world-readable document.
describe("F17 admin_stores is discovery-only, admin_stores_private is brand-only", () => {
  const STORE = "store_public_01";
  const OWNED_STORE = BRANCH;

  const staffPii = [
    {
      id: "STF-1",
      name: "Ravi Kumar",
      role: "Chef",
      phone: "+919820011224",
      email: "ravi@example.test",
    },
  ];

  const seedPublicDoc = async (id: string, withPii: boolean) => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "admin_stores", id), {
        title: "Legacy outlet",
        name: "Burgonomics Adajan",
        address: "Adajan Gam, Surat",
        city: "Surat",
        area: "Adajan",
        phone: "+919820011223",
        lat: 21.195,
        lng: 72.793,
        hours: { open: "10:00", close: "23:00" },
        supports: { delivery: true, takeaway: true, dineIn: true },
        isOpen: true,
        ...(withPii
          ? {
              staff: staffPii,
              documents: [{ id: "DOC-1", name: "FSSAI", type: "FSSAI" }],
              email: "manager.personal@example.test",
              managerName: "Ops Manager",
              managerPhone: "+919820099887",
              webhookUrl: "https://hooks.example.test/secret",
              webhookStatus: "active",
              todayRevenue: 48210,
            }
          : {}),
      });
      await setDoc(doc(ctx.firestore(), "admin_stores_private", id), {
        staff: staffPii,
        email: "manager.personal@example.test",
        webhookStatus: "active",
      });
    });
  };

  beforeEach(async () => {
    await seedPublicDoc(STORE, true);
    await seedPublicDoc(OWNED_STORE, false);
  });

  it("still allows anonymous read of the public store document", async () => {
    const guest = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(guest, "admin_stores", STORE)));
  });

  it("DENIES anonymous get AND list on the private companion", async () => {
    const guest = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(guest, "admin_stores_private", STORE)));
    await assertFails(getDocs(collection(guest, "admin_stores_private")));
  });

  it("DENIES customer and branch_staff reads/writes of the private companion", async () => {
    await assertFails(getDoc(doc(customerDb(), "admin_stores_private", STORE)));
    await assertFails(getDocs(collection(customerDb(), "admin_stores_private")));
    await assertFails(getDoc(doc(staffDb(), "admin_stores_private", STORE)));
    await assertFails(updateDoc(doc(staffDb(), "admin_stores_private", STORE), { staff: [] }));
    await assertFails(
      setDoc(doc(staffDb(), "admin_stores_private", "store_injected"), { staff: staffPii }),
    );
  });

  it("allows a brand owner to read and write the private companion", async () => {
    await assertSucceeds(getDoc(doc(brandDb(), "admin_stores_private", STORE)));
    await assertSucceeds(
      updateDoc(doc(brandDb(), "admin_stores_private", STORE), { staff: staffPii }),
    );
  });

  it("DENIES a brand owner publishing staff/compliance/contact/webhook/financial keys", async () => {
    for (const leak of [
      { staff: staffPii },
      { email: "manager.personal@example.test" },
      { managerPhone: "+919820099887" },
      { documents: [{ id: "DOC-1" }] },
      { webhookUrl: "https://hooks.example.test/secret" },
      { todayRevenue: 1 },
      { autoAcceptOrders: true },
    ]) {
      await assertFails(
        updateDoc(doc(brandDb(), "admin_stores", STORE), leak as Record<string, unknown>),
      );
    }
  });

  it("DENIES nested PII smuggled through a public discovery key", async () => {
    await assertFails(
      updateDoc(doc(brandDb(), "admin_stores", STORE), {
        name: { staff: staffPii },
      } as Record<string, unknown>),
    );
    await assertFails(
      updateDoc(doc(brandDb(), "admin_stores", STORE), {
        supports: { delivery: true, takeaway: true, dineIn: true, staff: staffPii },
      } as Record<string, unknown>),
    );
    await assertFails(
      updateDoc(doc(brandDb(), "admin_stores", STORE), {
        hours: { open: "10:00", close: "23:00", managerPhone: "+919820099887" },
      } as Record<string, unknown>),
    );
  });

  it("ALLOWS a brand full replacement that removes legacy PII from the public doc", async () => {
    // Exactly the sanitized projection adminStoresService commits: discovery
    // keys only - no staff/documents/manager contacts/webhook/financials.
    await assertSucceeds(
      setDoc(doc(brandDb(), "admin_stores", STORE), {
        name: "Burgonomics Adajan",
        address: "Adajan Gam, Surat",
        city: "Surat",
        area: "Adajan",
        phone: "+919820011223",
        lat: 21.195,
        lng: 72.793,
        latitude: 21.195,
        longitude: 72.793,
        hours: { open: "10:00", close: "23:00" },
        supports: { delivery: true, takeaway: true, dineIn: true },
        isOpen: true,
        pricing: { deliveryFeeFlat: 29 },
        petpoojaRestId: null,
      }),
    );
    await env.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDoc(doc(ctx.firestore(), "admin_stores", STORE));
      const data = snap.data() as Record<string, any>;
      expect(data.staff).toBeUndefined();
      expect(data.email).toBeUndefined();
      expect(data.managerPhone).toBeUndefined();
      expect(data.webhookUrl).toBeUndefined();
      expect(data.todayRevenue).toBeUndefined();
    });
  });

  it("keeps the narrow branch operator phone/isActive arm on its own clean public doc", async () => {
    await assertSucceeds(
      updateDoc(doc(staffDb(), "admin_stores", OWNED_STORE), {
        phone: "+919820011999",
        isActive: true,
      }),
    );
    // ...but the branch arm still cannot reach any other key.
    await assertFails(updateDoc(doc(staffDb(), "admin_stores", OWNED_STORE), { staff: staffPii }));
    await assertFails(updateDoc(doc(staffDb(), "admin_stores", OWNED_STORE), { todayRevenue: 0 }));
    await assertFails(
      updateDoc(doc(staffDb(), "admin_stores", OWNED_STORE), { email: "x@example.test" }),
    );
  });

  it("still DENIES a branch operator creating a public store", async () => {
    await assertFails(
      setDoc(doc(staffDb(), "admin_stores", "store_branch_created"), {
        name: "Own branch but staff-created",
        city: "Surat",
        lat: 21.195,
        lng: 72.793,
      }),
    );
  });

  // F17 review round 2 — the branch arm is typed, not just key-masked.
  it("DENIES a branch operator smuggling a nested map under an allowed scalar key", async () => {
    for (const smuggled of [
      { phone: { staff: staffPii } },
      { name: { staff: staffPii } },
      { address: { staff: staffPii } },
      { city: { staff: staffPii } },
      { area: { staff: staffPii } },
      { title: { staff: staffPii } },
      { isActive: { staff: staffPii } },
      { phone: staffPii },
    ]) {
      await assertFails(
        updateDoc(doc(staffDb(), "admin_stores", OWNED_STORE), smuggled as Record<string, unknown>),
      );
    }
  });

  it("ALLOWS a branch operator typing a real string + boolean metadata edit", async () => {
    // The exact shipped branch metadata shape: a string phone and a boolean
    // isActive, plus a Timestamp updatedAt (what useBranches writes today).
    await assertSucceeds(
      updateDoc(doc(staffDb(), "admin_stores", OWNED_STORE), {
        phone: "+919820011999",
        isActive: false,
        name: "Burgonomics Adajan (renamed)",
        city: "Surat",
      }),
    );
  });

  it("ALLOWS a branch operator string updatedAt (legacy importer format)", async () => {
    await assertSucceeds(
      updateDoc(doc(staffDb(), "admin_stores", OWNED_STORE), {
        phone: "+919820011999",
        updatedAt: "2026-11-17T10:00:00.000Z",
      }),
    );
  });

  it("ALLOWS a branch operator Timestamp updatedAt (shipped useBranches format)", async () => {
    await assertSucceeds(
      updateDoc(doc(staffDb(), "admin_stores", OWNED_STORE), {
        phone: "+919820011999",
        updatedAt: Timestamp.now(),
      }),
    );
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
      await assertFails(updateDoc(doc(staffDb(), "orders", "order_paid_01"), { [key]: value }));
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

  it("DENIES a foreign senderId while every other field stays the customer's own", async () => {
    // The case above changes senderId AND senderRole, so the role guard alone
    // denies it. Here only senderId is foreign: senderRole "customer" matches
    // the caller's token, readBy/chatId/keys are unchanged, and the caller is a
    // thread participant. That leaves the senderId == auth.uid pin as the sole
    // reason for denial, so removing it (and nothing else) must flip this test.
    await assertFails(
      addDoc(
        collection(customerDb(), "chats", "chat_pair_01", "messages"),
        legit({ senderId: FOREIGN_UID }),
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
        legit({
          senderId: STAFF_UID,
          senderName: "Support",
          senderRole: "brand_owner",
          readBy: [STAFF_UID],
        }),
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
        legit({
          senderId: STAFF_UID,
          senderName: "Staff",
          senderRole: "branch_staff",
          readBy: [STAFF_UID],
        }),
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
        legit({
          senderId: BRAND_UID,
          senderName: "Brand",
          senderRole: "brand_owner",
          readBy: [BRAND_UID],
        }),
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
    await assertSucceeds(setDoc(doc(customerDb(), "franchise_leads", "lead_3"), applicant()));
  });

  it("still allows a plain franchise_inquiries payload", async () => {
    await assertSucceeds(setDoc(doc(customerDb(), "franchise_inquiries", "inq_1"), applicant()));
  });

  it("DENIES an inquiry planting an approval flag", async () => {
    await assertFails(
      setDoc(doc(customerDb(), "franchise_inquiries", "inq_2"), applicant({ isApproved: true })),
    );
  });
});
