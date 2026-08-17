import admin from "firebase-admin";
import fs from "node:fs";

const BASE = "https://burgonomics.netlify.app/.netlify/functions/payments";

const sa = JSON.parse(
  fs.readFileSync("C:/Users/DELL/AppData/Local/Temp/opencode/creds/service-account.json", "utf8")
);
const gs = JSON.parse(fs.readFileSync("android/app/google-services.json", "utf8"));
const webApiKey = gs.client[0].api_key[0].current_key;

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}
const db = admin.firestore();

async function mintIdToken(uid) {
  const token = await admin.auth().createCustomToken(uid);
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${webApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, returnSecureToken: true }),
    }
  );
  const data = await res.json();
  if (!data.idToken) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
  return data.idToken;
}

async function post(path, body, token) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json };
}

const productSnap = await db.collection("petpooja_products").limit(1).get();
const product = productSnap.empty ? null : { id: productSnap.docs[0].id, ...productSnap.docs[0].data() };

console.log(`product: ${product ? product.id + " " + (product.name || "") + " @" + (product.price || product.min_price) : "NONE FOUND"}`);

const uid = "e2e-test-user";
const idToken = await mintIdToken(uid);
console.log(`idToken minted (${idToken.length} chars)`);

// 1. SUCCESS PATH
if (product) {
  const r1 = await post("/createPaymentOrder", {
    storeId: "burgonomics-main",
    fulfillment: "delivery",
    checkoutSnapshot: {
      store: { id: "burgonomics-main", name: "Burgonomics" },
      fulfillment: "delivery",
      items: [{ id: product.id, quantity: 2, customizations: [] }],
    },
  }, idToken);
  console.log(`createPaymentOrder SUCCESS: ${r1.status} orderId=${r1.json?.orderId} keyId=${r1.json?.keyId} amount=${r1.json?.amount}`);

  // 4. VERIFY PATH with a forged signature -> expect 403
  const r4 = await post("/verifyPayment", {
    orderId: r1.json?.orderId ?? "order_FAKE1234567890",
    paymentId: "pay_fake1234567890",
    signature: "deadbeefdeadbeef",
  }, idToken);
  console.log(`verifyPayment forged-signature: ${r4.status} ${r4.json?.message || ""}`);

  // 5. REAL signature but AMOUNT MISMATCH (existing ₹218 payment vs ₹352.90 order) -> expect 400
  const crypto = (await import("node:crypto")).default;
  const realSig = crypto.createHmac("sha256", "kBSyl3K6BHH14CNAbylEzp57")
    .update(`${r1.json.orderId}|pay_TPgBIeczc3jw83`).digest("hex");
  const r5 = await post("/verifyPayment", {
    orderId: r1.json.orderId,
    paymentId: "pay_TPgBIeczc3jw83",
    signature: realSig,
  }, idToken);
  console.log(`verifyPayment amount-mismatch: ${r5.status} ${r5.json?.message || ""}`);
}

// 2. EMPTY ITEMS -> expect 400
const r2 = await post("/createPaymentOrder", { items: [], fulfillment: "delivery" }, idToken);
console.log(`createPaymentOrder empty-items: ${r2.status} ${r2.json?.message || ""}`);

// 3. FORGED TOKEN -> expect 401
const r3 = await post("/createPaymentOrder", { items: [{ id: "x", quantity: 1 }] }, "forged.token.here");
console.log(`createPaymentOrder forged-token: ${r3.status} ${r3.json?.message || ""}`);

process.exit(0);