import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runReconciliation } from "../../netlify/functions/reconcile";

describe("Nightly Webhook & Gateway Reconciliation Engine (6 Tests)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // In-memory Firestore DB mock
  function createMockDb() {
    const store = new Map<string, any>();

    const db: any = {
      _store: store,
      collection: (colName: string) => {
        const queryConstraints: Array<{ field: string; op: string; val: any }> = [];
        let queryLimit = 100;

        const chain: any = {
          where: (field: string, op: string, val: any) => {
            queryConstraints.push({ field, op, val });
            return chain;
          },
          limit: (n: number) => {
            queryLimit = n;
            return chain;
          },
          doc: (docId: string) => ({
            get: async () => {
              const key = `${colName}/${docId}`;
              const data = store.get(key);
              return {
                exists: Boolean(data),
                id: docId,
                data: () => data,
              };
            },
            set: async (data: any) => {
              const key = `${colName}/${docId}`;
              store.set(key, { ...data });
            },
            update: async (data: any) => {
              const key = `${colName}/${docId}`;
              const existing = store.get(key) || {};
              store.set(key, { ...existing, ...data });
            },
          }),
          get: async () => {
            const results: any[] = [];
            for (const [key, value] of store.entries()) {
              if (key.startsWith(`${colName}/`)) {
                const docId = key.split("/")[1];
                let matches = true;

                for (const c of queryConstraints) {
                  if (c.op === "==" && value[c.field] !== c.val) matches = false;
                  if (c.op === ">=" && value[c.field] < c.val) matches = false;
                }

                if (matches) {
                  results.push({
                    id: docId,
                    data: () => value,
                  });
                }
              }
            }

            const limited = results.slice(0, queryLimit);
            return {
              docs: limited,
              size: limited.length,
              empty: limited.length === 0,
            };
          },
        };

        return chain;
      },
    };

    return db;
  }

  // =========================================================================
  // 1. Dry Run Mode Performs 0 Writes
  // =========================================================================

  it("1. [DRY-RUN-NO-WRITE] detects discrepancies but performs 0 database writes when dryRun=true", async () => {
    const db = createMockDb();

    // Seed order stuck in Pending
    await db.collection("orders").doc("ord_dry_1").set({
      id: "ord_dry_1",
      paymentStatus: "Pending",
      payment: { status: "pending", transactionId: "pay_rzp_dry_1" },
      totals: { grandTotal: 349 },
      createdAt: new Date().toISOString(),
    });

    const mockRazorpay = {
      payments: {
        fetch: vi.fn().mockResolvedValue({ id: "pay_rzp_dry_1", status: "captured", amount: 34900 }),
      },
    };

    const res = await runReconciliation(db, {
      dryRun: true,
      razorpayClient: mockRazorpay,
    });

    expect(res.dryRun).toBe(true);
    expect(res.discrepanciesFound).toBe(1);
    expect(res.fixesWouldApply.length).toBe(1);
    expect(res.fixesApplied.length).toBe(0);

    // Assert order document was NOT updated
    const orderDoc = await db.collection("orders").doc("ord_dry_1").get();
    expect(orderDoc.data().paymentStatus).toBe("Pending");

    // Assert no discrepancy or audit docs were created
    const discDoc = await db.collection("payment_discrepancies").doc("ord_dry_1").get();
    expect(discDoc.exists).toBe(false);
  });

  // =========================================================================
  // 2. Detects Mismatch and Repairs Order & Writes Audit
  // =========================================================================

  it("2. [DETECTS-MISMATCH-REPAIRS] repairs orders stuck as Pending and writes payment_discrepancies + paymentAudits", async () => {
    const db = createMockDb();

    await db.collection("orders").doc("ord_repair_2").set({
      id: "ord_repair_2",
      branchId: "branch_navrangpura",
      paymentStatus: "Pending",
      payment: { status: "pending", transactionId: "pay_rzp_repair_2" },
      totals: { grandTotal: 499 },
      createdAt: new Date().toISOString(),
    });

    const mockRazorpay = {
      payments: {
        fetch: vi.fn().mockResolvedValue({ id: "pay_rzp_repair_2", status: "captured", amount: 49900 }),
      },
    };

    const res = await runReconciliation(db, {
      dryRun: false,
      razorpayClient: mockRazorpay,
      now: new Date("2026-08-23T12:00:00Z"),
    });

    expect(res.discrepanciesFound).toBe(1);
    expect(res.fixesApplied.length).toBe(1);

    // 1. Order status is fixed to Paid
    const orderDoc = await db.collection("orders").doc("ord_repair_2").get();
    expect(orderDoc.data().paymentStatus).toBe("Paid");
    expect(orderDoc.data()["payment.status"]).toBe("paid");

    // 2. Discrepancy logged
    const discDoc = await db.collection("payment_discrepancies").doc("ord_repair_2").get();
    expect(discDoc.exists).toBe(true);
    expect(discDoc.data().expected).toBe("Paid");
    expect(discDoc.data().gateway).toBe("captured");

    // 3. Payment audit created with kind: reconcile_fix
    const auditDoc = await db.collection("paymentAudits").doc("reconcile_ord_repair_2_2026-08-23").get();
    expect(auditDoc.exists).toBe(true);
    expect(auditDoc.data().kind).toBe("reconcile_fix");
    expect(auditDoc.data().amount).toBe(499);
  });

  // =========================================================================
  // 3. Idempotent Reconcile Audit Logs
  // =========================================================================

  it("3. [IDEMPOTENT-AUDIT] prevents duplicate paymentAudits writes on multiple reconciliation runs on the same date", async () => {
    const db = createMockDb();

    await db.collection("orders").doc("ord_idem_3").set({
      id: "ord_idem_3",
      paymentStatus: "Pending",
      payment: { status: "pending", transactionId: "pay_rzp_idem_3" },
      totals: { grandTotal: 250 },
      createdAt: new Date().toISOString(),
    });

    const mockRazorpay = {
      payments: {
        fetch: vi.fn().mockResolvedValue({ id: "pay_rzp_idem_3", status: "captured", amount: 25000 }),
      },
    };

    const fixedDate = new Date("2026-08-23T15:00:00Z");

    // Run 1
    await runReconciliation(db, {
      dryRun: false,
      razorpayClient: mockRazorpay,
      now: fixedDate,
    });

    const auditKey = "reconcile_ord_idem_3_2026-08-23";
    const auditDoc1 = await db.collection("paymentAudits").doc(auditKey).get();
    expect(auditDoc1.exists).toBe(true);

    // Run 2 on same day: order is already marked Paid so no duplicate audit doc attempt
    const res2 = await runReconciliation(db, {
      dryRun: false,
      razorpayClient: mockRazorpay,
      now: fixedDate,
    });

    expect(res2.discrepanciesFound).toBe(0);
  });

  // =========================================================================
  // 4. Petpooja Retry Queue Reprocessing
  // =========================================================================

  it("4. [PETPOOJA-RETRY-REQUEUE] re-executes processPetpoojaOrder for pending_petpooja_retry items", async () => {
    const db = createMockDb();

    await db.collection("petpooja_orders").doc("ord_retry_4").set({
      orderId: "ord_retry_4",
      branchId: "branch_01",
      restId: "rest_100",
      payload: { app_key: "k" },
      status: "pending_petpooja_retry",
      attempts: 1,
      nextRetryAt: "2026-08-23T00:00:00.000Z", // past time -> should retry
    });

    // Mock successful 200 on retry
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: "success", orderID: "pp_123" }),
    } as any);

    const res = await runReconciliation(db, {
      dryRun: false,
      fetchFn: mockFetch,
      now: new Date("2026-08-23T12:00:00Z"),
    });

    expect(res.petpoojaRetried.length).toBe(1);
    expect(res.petpoojaRetried[0].orderId).toBe("ord_retry_4");

    const queueDoc = await db.collection("petpooja_orders").doc("ord_retry_4").get();
    expect(queueDoc.data().status).toBe("synced");
  });

  // =========================================================================
  // 5. Skips Gracefully when Gateway is Empty or Disabled
  // =========================================================================

  it("5. [SKIPS-GATEWAY-EMPTY] runs gracefully without errors when no live Razorpay credentials exist", async () => {
    const db = createMockDb();

    await db.collection("orders").doc("ord_no_gateway_5").set({
      id: "ord_no_gateway_5",
      paymentStatus: "Paid",
      totals: { grandTotal: 300 },
      createdAt: new Date().toISOString(),
    });

    const res = await runReconciliation(db, {
      dryRun: false,
      razorpayClient: undefined,
    });

    expect(res.status).toBe("success");
    expect(res.ordersChecked).toBe(1);
    expect(res.discrepanciesFound).toBe(0);
  });

  // =========================================================================
  // 6. Handles Empty Database Gracefully
  // =========================================================================

  it("6. [HANDLES-EMPTY-DB] finishes with zero discrepancies and 200 status when 0 orders exist", async () => {
    const db = createMockDb();

    const res = await runReconciliation(db, {
      dryRun: false,
    });

    expect(res.status).toBe("success");
    expect(res.ordersChecked).toBe(0);
    expect(res.discrepanciesFound).toBe(0);
    expect(res.fixesApplied.length).toBe(0);
  });
});
