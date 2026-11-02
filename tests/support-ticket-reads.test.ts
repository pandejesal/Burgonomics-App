import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The customer must really see their own tickets.
 *
 * There is no GET route for a customer's ticket list in backend
 * functions/src/index.ts (52 routes, none of them a ticket read). The Firestore
 * rules DO allow the owner to read their own docs
 * (backend/firestore.rules support_tickets block: allow read when
 * isAuthenticated() && resource.data.customerId == request.auth.uid), so the
 * list is served from the support_tickets collection as the signed-in customer,
 * using the composite index {customerId ASC, createdAt DESC} that
 * firestore.indexes.json already declares.
 *
 * These tests pin:
 *  - the query is scoped to the caller's uid (never an unscoped collection read)
 *  - the REAL stored ticket shape (tickets.service.ts createTicket 364-387)
 *    maps to the UI row, including subject/description/attachments/status
 *  - a failed load is an ERROR, never a false empty list
 *
 * Mocks use the same relative specifiers the module under test imports, because
 * vi.mock matches the resolved id.
 */

const getDocs = vi.fn();
const collection = vi.fn((_db: unknown, name: string) => ({ kind: "col", name }));
const query = vi.fn((...parts: unknown[]) => ({ kind: "query", parts }));
const where = vi.fn((field: string, op: string, value: unknown) => ({
  kind: "where",
  field,
  op,
  value,
}));
const orderBy = vi.fn((field: string, dir: string) => ({ kind: "orderBy", field, dir }));
const limit = vi.fn((n: number) => ({ kind: "limit", n }));

vi.mock("firebase/firestore", () => ({
  collection: (...a: unknown[]) => collection(...(a as [unknown, string])),
  query: (...a: unknown[]) => query(...a),
  where: (...a: unknown[]) => where(...(a as [string, string, unknown])),
  orderBy: (...a: unknown[]) => orderBy(...(a as [string, string])),
  limit: (...a: unknown[]) => limit(...(a as [number])),
  getDocs: (...a: unknown[]) => getDocs(...a),
}));

vi.mock("../src/core/config/firebase", () => ({
  db: { __mockDb: true },
  auth: { currentUser: { getIdToken: async () => "t" } },
}));

/** A document exactly as tickets.service.ts createTicket stores it (364-387). */
function storedTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: "tkt_1793556277179_abc12",
    ticketNumber: "TKT-42117",
    customerId: "uid_customer_1",
    customerName: "Aarav Shah",
    customerPhone: "+919106515036",
    orderId: "ORD-9911",
    branchId: "branch_01",
    category: "food_quality",
    priority: "high",
    status: "open",
    subject: "Cold on arrival",
    description: "The burger was cold when it reached me.",
    attachments: [
      "https://firebasestorage.googleapis.com/v0/b/burgonomics-7faa8.firebasestorage.app/o/support-evidence%2Fuid_customer_1%2Ftkt%2F1_a.png?alt=media&token=abc",
    ],
    assignedTo: { tier: "branch" },
    timeline: [],
    diagnostics: {},
    branchReminderSent: false,
    createdAt: "2026-11-01T18:00:00.000Z",
    updatedAt: "2026-11-01T18:00:00.000Z",
    lastActivityAt: "2026-11-01T18:00:00.000Z",
    ...overrides,
  };
}

function docSnap(id: string, data: unknown) {
  return { id, data: () => data, exists: () => true };
}

const MODULE = "../src/features/support/services/ticketReads";

beforeEach(() => {
  vi.resetModules();
  getDocs.mockReset();
  collection.mockClear();
  query.mockClear();
  where.mockClear();
  orderBy.mockClear();
  limit.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ticket list is served from Firestore for the signed-in customer", () => {
  it("queries support_tickets scoped to the caller uid, newest first", async () => {
    getDocs.mockResolvedValue({ docs: [docSnap("tkt_1", storedTicket())] });
    const { fetchMyTickets } = await import(MODULE);

    const res = await fetchMyTickets("uid_customer_1");

    expect(res.success).toBe(true);
    expect(collection).toHaveBeenCalledWith(expect.anything(), "support_tickets");
    expect(where).toHaveBeenCalledWith("customerId", "==", "uid_customer_1");
    expect(orderBy).toHaveBeenCalledWith("createdAt", "desc");
  });

  it("maps the real stored document into the client row shape", async () => {
    getDocs.mockResolvedValue({ docs: [docSnap("tkt_1", storedTicket())] });
    const { fetchMyTickets } = await import(MODULE);

    const res = await fetchMyTickets("uid_customer_1");

    expect(res.success).toBe(true);
    if (!res.success) return;
    const [t] = res.data;
    expect(t.id).toBe("tkt_1793556277179_abc12");
    expect(t.ticketNumber).toBe("TKT-42117");
    expect(t.status).toBe("OPEN");
    expect(t.description).toBe("The burger was cold when it reached me.");
    expect(t.subject).toBe("Cold on arrival");
    expect(t.orderId).toBe("ORD-9911");
    expect(t.branchId).toBe("branch_01");
    // The customer must see the photos they attached.
    expect(t.attachments).toHaveLength(1);
    expect(t.attachments[0]).toContain("support-evidence");
    expect(t.createdAt).toBe("2026-11-01T18:00:00.000Z");
  });

  it("returns a failure when the read throws — never an empty success", async () => {
    getDocs.mockRejectedValue(new Error("permission-denied"));
    const { fetchMyTickets } = await import(MODULE);

    const res = await fetchMyTickets("uid_customer_1");

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe("TICKETS_LOAD_FAILED");
      expect(res.error.retryable).toBe(true);
    }
  });

  it("refuses to run without a uid (no unscoped collection read)", async () => {
    const { fetchMyTickets } = await import(MODULE);

    const res = await fetchMyTickets("");

    expect(res.success).toBe(false);
    expect(getDocs).not.toHaveBeenCalled();
  });

  it("drops documents that belong to a different customer", async () => {
    // Defence in depth: rules should already refuse these, but a mis-scoped
    // query must never render someone else's ticket.
    getDocs.mockResolvedValue({
      docs: [
        docSnap("tkt_mine", storedTicket()),
        docSnap("tkt_theirs", storedTicket({ id: "tkt_theirs", customerId: "uid_someone_else" })),
      ],
    });
    const { fetchMyTickets } = await import(MODULE);

    const res = await fetchMyTickets("uid_customer_1");

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.map((t) => t.id)).toEqual(["tkt_1793556277179_abc12"]);
  });

  it("accepts a Firestore Timestamp createdAt as well as an ISO string", async () => {
    const ts = { toDate: () => new Date("2026-10-30T09:15:00.000Z") };
    getDocs.mockResolvedValue({ docs: [docSnap("tkt_1", storedTicket({ createdAt: ts }))] });
    const { fetchMyTickets } = await import(MODULE);

    const res = await fetchMyTickets("uid_customer_1");

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data[0].createdAt).toBe("2026-10-30T09:15:00.000Z");
  });
});

describe("resolution is surfaced to the customer in BOTH stored forms", () => {
  // tickets.service.ts resolveTicket() writes `resolution` as an OBJECT
  // (line 828-837): { action, amount, couponCode, notes, refundResult,
  // resolvedBy, resolvedByName, resolvedAt }. resolveNote() writes a plain
  // STRING. A customer must see why their ticket closed in either case.
  const RESOLVED_OBJECT = {
    action: "partial_refund" as const,
    amount: 150,
    couponCode: null,
    notes: "Burger arrived cold — ₹150 refunded to the original payment method.",
    refundResult: { refundId: "pay_R1234", status: "processed" },
    resolvedBy: "uid_staff_7",
    resolvedByName: "Priya (Brand Support)",
    resolvedAt: "2026-11-01T12:30:00.000Z",
  };

  it("reads the notes out of the resolveTicket resolution OBJECT", async () => {
    getDocs.mockResolvedValue({
      docs: [
        docSnap(
          "tkt_resolved",
          storedTicket({ id: "tkt_resolved", status: "resolved", resolution: RESOLVED_OBJECT }),
        ),
      ],
    });
    const { fetchMyTickets } = await import(MODULE);

    const res = await fetchMyTickets("uid_customer_1");

    expect(res.success).toBe(true);
    if (!res.success) return;
    const t = res.data[0];
    expect(t.status).toBe("RESOLVED");
    // The actual reason, not "[object Object]" and not undefined.
    expect(t.managerResponse).toBe(
      "Burger arrived cold — ₹150 refunded to the original payment method.",
    );
    expect(t.managerResponse).not.toContain("[object Object]");
  });

  it("still reads a plain STRING resolution (resolveNote path)", async () => {
    getDocs.mockResolvedValue({
      docs: [
        docSnap(
          "tkt_note",
          storedTicket({
            id: "tkt_note",
            status: "resolved",
            resolution: "Resolved by staff after calling the customer.",
          }),
        ),
      ],
    });
    const { fetchMyTickets } = await import(MODULE);

    const res = await fetchMyTickets("uid_customer_1");

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data[0].managerResponse).toBe("Resolved by staff after calling the customer.");
  });

  it("uses resolvedAt from the resolution object when the doc has none", async () => {
    getDocs.mockResolvedValue({
      docs: [
        docSnap(
          "tkt_resolved",
          storedTicket({
            id: "tkt_resolved",
            status: "resolved",
            resolution: RESOLVED_OBJECT,
            resolvedAt: undefined,
          }),
        ),
      ],
    });
    const { fetchMyTickets } = await import(MODULE);

    const res = await fetchMyTickets("uid_customer_1");

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data[0].resolvedAt).toBe("2026-11-01T12:30:00.000Z");
  });

  it("returns undefined (never a bogus string) when resolution is absent", async () => {
    getDocs.mockResolvedValue({
      docs: [docSnap("tkt_open", storedTicket({ id: "tkt_open", resolution: undefined }))],
    });
    const { fetchMyTickets } = await import(MODULE);

    const res = await fetchMyTickets("uid_customer_1");

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data[0].managerResponse).toBeUndefined();
  });
});
