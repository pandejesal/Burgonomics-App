import crypto from "crypto";
import fs from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const URL = "https://burgonomics.netlify.app/.netlify/functions/payments/razorpayWebhook";
const SECRET = "d043e8b2ff6d6ab609ebfb3bc7ca1433ba127fcf234b10698c5d52e9c56bbf23";

const sa = JSON.parse(
  fs.readFileSync("C:/Users/DELL/AppData/Local/Temp/opencode/creds/service-account.json", "utf8"),
);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

function sign(body) {
  return crypto.createHmac("sha256", SECRET).update(body).digest("hex");
}

async function send(name, payload, expectStatus, note = "") {
  const body = JSON.stringify(payload);
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Razorpay-Signature": sign(body) },
    body,
  });
  const txt = await r.text();
  const ok = r.status === expectStatus;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}: got ${r.status} (want ${expectStatus}) ${note} body=${txt.slice(0, 120)}`,
  );
  return { status: r.status, body: txt };
}

await send(
  "fake-payment-reverify",
  {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_definitely_fake_123",
          order_id: "order_definitely_fake_123",
          notes: { orderId: "order_definitely_fake_123" },
        },
      },
    },
  },
  500,
  "(rzp.payments.fetch should 404 to 500)",
);

const r2 = await send(
  "real-payment-from-phase1",
  {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_TPgBIeczc3jw83",
          order_id: "order_TQNdQMeJwQEjlb",
          notes: { orderId: "order_TQNdQMeJwQEjlb" },
          email: "test@example.com",
          contact: "9876543210",
        },
      },
    },
  },
  200,
  "(200 either way: skip-if-not-captured or finalize)",
);

if (r2.status === 200) {
  await send(
    "replay-dedup",
    {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_TPgBIeczc3jw83",
            order_id: "order_TQNdQMeJwQEjlb",
            notes: { orderId: "order_TQNdQMeJwQEjlb" },
          },
        },
      },
    },
    200,
    "(expect dedup:true)",
  );
}

await send(
  "payment-failed-fake",
  {
    event: "payment.failed",
    payload: {
      payment: {
        entity: {
          id: "pay_fake_failed_1",
          order_id: "order_nonexistent_x",
          notes: { orderId: "order_nonexistent_x" },
        },
      },
    },
  },
  200,
);

await send(
  "settlement-processed",
  {
    event: "settlement.processed",
    payload: {
      settlement: {
        entity: {
          id: "setl_test_harness_1",
          utr: "UTR1234567890X",
          amount: 149000,
          fees: 1000,
          tax: 180,
          settlement_period: { start: "2026-08-10", end: "2026-08-16" },
        },
      },
    },
  },
  200,
);

await send(
  "unknown-event-ack",
  { event: "payment.authorized", payload: { payment: { entity: { id: "pay_unknown_1" } } } },
  200,
);

console.log("\n-- Firestore effects --");
const checks = [
  ["payments", "pay_TPgBIeczc3jw83"],
  ["payments", "pay_fake_failed_1"],
  ["settlements", "setl_test_harness_1"],
];
for (const [col, id] of checks) {
  const s = await db.collection(col).doc(id).get();
  console.log(`${col}/${id}: ${s.exists ? JSON.stringify(s.data()).slice(0, 220) : "MISSING"}`);
}
const events = await db.collection("webhook_events").orderBy("time", "desc").limit(6).get();
console.log("webhook_events (latest 6):");
for (const d of events.docs)
  console.log(`  ${d.data().event} | ${d.data().status} | ${d.data().eventId}`);

process.exit(0);
