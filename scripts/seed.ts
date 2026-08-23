/**
 * Firestore Catalog & Store Seeding Script (Admin SDK)
 *
 * Bypasses client security rules by initializing Firebase Admin SDK with a service account.
 *
 * Usage:
 *   PowerShell:
 *     $env:GOOGLE_APPLICATION_CREDENTIALS="path\to\serviceAccountKey.json"
 *     npx tsx scripts/seed.ts
 *
 *   Bash / macOS / Linux:
 *     GOOGLE_APPLICATION_CREDENTIALS="path/to/serviceAccountKey.json" npx tsx scripts/seed.ts
 *
 *   Or via inline JSON string:
 *     $env:FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
 *     npx tsx scripts/seed.ts
 */
import { initializeApp, getApps, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import * as fs from "fs";
import { SAMPLE_CATEGORIES, SAMPLE_PRODUCTS } from "../src/features/menu/data/petpoojaSampleData";
import { INITIAL_RICH_STORES } from "../src/admin/pages/storesData";

function initFirebaseAdmin() {
  if (getApps().length > 0) {
    return getFirestore();
  }

  let credential;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      credential = cert(parsed);
    } catch (e) {
      console.error("Error parsing FIREBASE_SERVICE_ACCOUNT environment variable:", e);
      throw e;
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (fs.existsSync(credPath)) {
      try {
        const fileContent = fs.readFileSync(credPath, "utf8");
        const parsed = JSON.parse(fileContent);
        credential = cert(parsed);
      } catch {
        credential = applicationDefault();
      }
    } else {
      credential = applicationDefault();
    }
  } else {
    credential = applicationDefault();
  }

  initializeApp({
    credential,
    projectId: process.env.FIREBASE_PROJECT_ID || "burgonomics-7faa8",
  });

  return getFirestore();
}

async function run() {
  const db = initFirebaseAdmin();

  console.log("Seeding Categories...");
  const categoriesRef = db.collection("petpooja_categories");
  for (const cat of SAMPLE_CATEGORIES) {
    // Exclude the 'itemCount' property from the uploaded document
    const { itemCount, ...categoryData } = cat as any;
    await categoriesRef.doc(categoryData.id).set(categoryData);
  }

  console.log("Seeding Products...");
  const productsRef = db.collection("petpooja_products");
  for (const prod of SAMPLE_PRODUCTS) {
    await productsRef.doc(prod.id).set(prod);
  }

  console.log("Seeding Global Pricing Configuration (app_settings/pricing)...");
  // PLACEHOLDER_UNTIL_PETPOOJA: Structural stand-in values until live Petpooja credentials arrive at app finalization
  const PLACEHOLDER_UNTIL_PETPOOJA_GLOBAL_PRICING = {
    gstRate: 0.05, // PLACEHOLDER_UNTIL_PETPOOJA: 5% GST stand-in
    packingChargePerItem: 5, // PLACEHOLDER_UNTIL_PETPOOJA: ₹5/item packing charge stand-in
    deliveryFeeFlat: 40, // PLACEHOLDER_UNTIL_PETPOOJA: ₹40 flat delivery fee stand-in
    freeDeliveryThreshold: 499, // PLACEHOLDER_UNTIL_PETPOOJA: ₹499 free delivery threshold stand-in
    minOrderAmount: 0, // PLACEHOLDER_UNTIL_PETPOOJA: minimum order amount stand-in
    updatedAt: new Date().toISOString(),
  };
  await db.collection("app_settings").doc("pricing").set(PLACEHOLDER_UNTIL_PETPOOJA_GLOBAL_PRICING);

  console.log("Seeding Stores & Admin Stores (17 Outlets)...");
  const adminStoresRef = db.collection("admin_stores");
  const storesRef = db.collection("stores");
  for (const store of INITIAL_RICH_STORES) {
    const lat = store.lat || (store as any).location?.latitude || 23.0225;
    const lng = store.lng || (store as any).location?.longitude || 72.5714;
    const storeData = {
      id: store.id,
      name: store.name,
      address: store.address || "",
      city: store.city || "",
      state: store.state || "Gujarat",
      pincode: store.pincode || "380009",
      country: store.country || "India",
      phone: store.phone || null,
      status: "OPEN",
      isOpen: true,
      isBusy: false,
      isRecentlyOpened: false,
      latitude: lat,
      longitude: lng,
      lat,
      lng,
      minPrepMinutes: 15,
      deliveryRadiusKm: 7,
      distanceKm: 0,
      deliveryFee: 40, // PLACEHOLDER_UNTIL_PETPOOJA: fallback delivery fee
      // PLACEHOLDER_UNTIL_PETPOOJA: Per-store pricing override stand-ins until store sync via Petpooja
      pricing: {
        gstRate: 0.05, // PLACEHOLDER_UNTIL_PETPOOJA: 5% GST
        packingChargePerItem: 5, // PLACEHOLDER_UNTIL_PETPOOJA: ₹5/item
        deliveryFeeFlat: 40, // PLACEHOLDER_UNTIL_PETPOOJA: ₹40 flat delivery
        freeDeliveryThreshold: 499, // PLACEHOLDER_UNTIL_PETPOOJA: ₹499 threshold
        minOrderAmount: 0, // PLACEHOLDER_UNTIL_PETPOOJA: min order
      },
      turnOnAt: null,
      petpoojaRestId: (store as any).petpoojaRestId || null,
      supports: { delivery: true, takeaway: true, dineIn: true },
      features: { porterEnabled: false },
      updatedAt: new Date().toISOString(),
    };
    await adminStoresRef.doc(store.id).set(storeData);
    await storesRef.doc(store.id).set(storeData);
  }

  console.log("Seeding Demo Data (users, orders, payments, refunds)...");
  await seedDemoData(db);

  console.log(
    "Successfully seeded all categories, products, 17 admin stores, pricing config, and demo data to Firestore!",
  );
  process.exit(0);
}

/**
 * Demo account data: users, orders, payments, refunds — all flagged demo:true
 * so admin analytics can filter them. Also creates the phone-auth E2E test
 * user (+91 98765 01234) with attached orders for the account-deletion pass.
 */
const DEMO_USERS = [
  {
    id: "demo_user_priya",
    fullName: "Priya Sharma",
    phone: "+919876123401",
    email: "priya.demo@burgonomics.in",
  },
  {
    id: "demo_user_rahul",
    fullName: "Rahul Mehta",
    phone: "+919876123402",
    email: "rahul.demo@burgonomics.in",
  },
  {
    id: "demo_user_anjali",
    fullName: "Anjali Patel",
    phone: "+919876123403",
    email: "anjali.demo@burgonomics.in",
  },
];

const E2E_PHONE = "+919876501234"; // Test OTP 123456

interface SeedLine {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

const DEMO_MENU: SeedLine[] = [
  {
    productId: "prd_alfanso_mango_shake",
    name: "Alfanso Mango Shake",
    quantity: 1,
    unitPrice: 149,
  },
  { productId: "prd_chocolate_blast", name: "Chocolate Blast", quantity: 1, unitPrice: 129 },
  { productId: "prd_butter_paneer", name: "Butter Paneer Combo", quantity: 1, unitPrice: 219 },
  { productId: "prd_veg_burger", name: "Veg Burger", quantity: 1, unitPrice: 99 },
  { productId: "prd_french_fries", name: "French Fries", quantity: 1, unitPrice: 89 },
  { productId: "prd_oreo_shake", name: "Oreo Shake", quantity: 1, unitPrice: 159 },
];

function seedGrandTotal(items: SeedLine[]): {
  subtotal: number;
  taxes: number;
  deliveryFee: number;
  grandTotal: number;
} {
  const subtotal = items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
  const taxes = Math.round(subtotal * 0.05 * 100) / 100;
  const deliveryFee = subtotal > 499 ? 0 : 40;
  const grandTotal = Math.round((subtotal + taxes + deliveryFee) * 100) / 100;
  return { subtotal, taxes, deliveryFee, grandTotal };
}

function pickLines(): SeedLine[] {
  const count = 1 + Math.floor(Math.random() * 3);
  const shuffled = [...DEMO_MENU].sort(() => Math.random() - 0.5);
  return shuffled
    .slice(0, count)
    .map((it) => ({ ...it, quantity: 1 + Math.floor(Math.random() * 2) }));
}

function isoDaysAgo(days: number, hourJitter = 0): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000 - hourJitter * 60 * 60 * 1000);
  return d.toISOString();
}

async function ensureAuthUser(phone: string, displayName: string): Promise<string> {
  const auth = getAuth();
  try {
    const user = await auth.getUserByPhoneNumber(phone);
    console.log(`Auth user already exists: ${user.uid} (${phone})`);
    return user.uid;
  } catch (e: any) {
    if (e?.code !== "auth/user-not-found") throw e;
  }
  const created = await auth.createUser({ phoneNumber: phone, displayName });
  console.log(`Created auth user: ${created.uid} (${phone})`);
  return created.uid;
}

function serverTs() {
  return FieldValue.serverTimestamp();
}

function tsFromMillis(millis: number) {
  return new Timestamp(Math.floor(millis / 1000), (millis % 1000) * 1e6);
}

async function seedDemoData(db: FirebaseFirestore.Firestore) {
  const now = Date.now();
  const activeStatuses = ["PREPARING", "OUT_FOR_DELIVERY"];

  // 1. Demo users (Firestore docs only — no auth accounts needed)
  const usersRef = db.collection("users");
  for (const u of DEMO_USERS) {
    await usersRef.doc(u.id).set({
      id: u.id,
      fullName: u.fullName,
      phone: u.phone,
      email: u.email,
      demo: true,
      createdAt: serverTs(),
      updatedAt: serverTs(),
    });
  }

  // 2. E2E test user (real auth account + Firestore doc)
  const e2eUid = await ensureAuthUser(E2E_PHONE, "Test User");
  await usersRef.doc(e2eUid).set(
    {
      id: e2eUid,
      fullName: "Test User",
      phone: E2E_PHONE,
      demo: true,
      createdAt: serverTs(),
      updatedAt: serverTs(),
    },
    { merge: true },
  );

  // 3. Orders + payments
  const ordersRef = db.collection("orders");
  const paymentsRef = db.collection("payments");
  let orderIndex = 0;

  const seedOrdersFor = async (userId: string, count: number, maxDays: number) => {
    for (let i = 0; i < count; i++) {
      const daysAgo = Math.random() * maxDays;
      const placedAt = isoDaysAgo(daysAgo, Math.random() * 10);
      const items = pickLines();
      const totals = seedGrandTotal(items);
      const statusCode =
        daysAgo < 1
          ? activeStatuses[Math.floor(Math.random() * activeStatuses.length)]
          : "COMPLETED";
      const orderId = `demo_o_${(++orderIndex).toString().padStart(3, "0")}`;
      const txSuffix = orderId.slice(-3);

      await ordersRef.doc(orderId).set({
        id: orderId,
        shortCode: `BG-D${orderId.slice(-4).toUpperCase()}`,
        status: {
          code: statusCode,
          label:
            statusCode === "COMPLETED"
              ? "Delivered"
              : statusCode === "PREPARING"
                ? "Preparing"
                : "Out for delivery",
          kind: statusCode === "COMPLETED" ? "completed" : "in_progress",
          terminal: statusCode === "COMPLETED",
        },
        fulfillment: "delivery",
        store: {
          id: "store_sg_01",
          name: "Burgonomics HQ",
          address: "SG Highway, Ahmedabad",
          city: "Ahmedabad",
          state: "Gujarat",
          pincode: "380015",
          phone: "+91 98765 00001",
          lat: 23.0225,
          lng: 72.5714,
        },
        address: {
          label: "Home",
          contactName: "Demo Customer",
          contactPhone: userId.startsWith("demo_") ? u_phone(userId) : E2E_PHONE,
          line1: "21, Demo Residency",
          city: "Ahmedabad",
          state: "Gujarat",
          pincode: "380015",
        },
        items: items.map((it) => ({
          lineId: `li_${orderId}_${it.productId}`,
          productId: it.productId,
          name: it.name,
          unitPrice: it.unitPrice,
          price: it.unitPrice,
          quantity: it.quantity,
          availability: "available",
        })),
        totals: { ...totals, currency: "INR", packingFee: 0, itemDiscount: 0, promoDiscount: 0 },
        payment: {
          method: "online",
          label: "Paid Online (Razorpay)",
          status: "paid",
          transactionId: `pay_demo_${txSuffix}`,
          paidAt: placedAt,
        },
        paymentStatus: "Paid",
        petpoojaStatus: statusCode === "COMPLETED" ? "Synced" : "Pending",
        placedAt,
        estimatedAt: new Date(new Date(placedAt).getTime() + 35 * 60000).toISOString(),
        ...(statusCode === "COMPLETED"
          ? { completedAt: new Date(new Date(placedAt).getTime() + 45 * 60000).toISOString() }
          : {}),
        userId,
        demo: true,
        createdAt: tsFromMillis(new Date(placedAt).getTime()),
        updatedAt: tsFromMillis(now),
      });

      await paymentsRef.doc(`demo_pay_${txSuffix}`).set({
        id: `demo_pay_${txSuffix}`,
        orderId,
        status: "CAPTURED",
        amountPaise: Math.round(totals.grandTotal * 100),
        currency: "INR",
        gateway: "razorpay",
        gatewayPaymentId: `pay_demo_${txSuffix}`,
        capturedAt: tsFromMillis(new Date(placedAt).getTime()),
        createdAt: tsFromMillis(new Date(placedAt).getTime()),
        demo: true,
      });
    }
  };

  function u_phone(userId: string): string {
    return DEMO_USERS.find((u) => u.id === userId)?.phone || "+919876123400";
  }

  // Demo users: 12–16 orders each across 30 days
  for (const u of DEMO_USERS) {
    await seedOrdersFor(u.id, 12 + Math.floor(Math.random() * 5), 30);
  }

  // E2E test user: 5 orders, spread over 30 days (for the deletion pass)
  await seedOrdersFor(e2eUid, 5, 30);
  console.log(`E2E user ${e2eUid}: 5 demo orders attached`);

  // 4. A few refunds to exercise the refunds ledger
  const refundDoc = async (
    id: string,
    paymentId: string,
    orderId: string,
    amountPaise: number,
    status: string,
    gatewayStatus: string,
  ) => {
    await db
      .collection("refunds")
      .doc(id)
      .set({
        id,
        paymentId,
        orderId,
        amountPaise,
        status,
        completedAt: status === "COMPLETED" ? serverTs() : null,
        gatewayStatus,
        createdAt: serverTs(),
        updatedAt: serverTs(),
        demo: true,
      });
  };
  await refundDoc("demo_ref_001", "demo_pay_002", "demo_o_002", 9900, "COMPLETED", "processed");
  await refundDoc("demo_ref_002", "demo_pay_007", "demo_o_007", 12900, "COMPLETED", "processed");
  await refundDoc("demo_ref_003", "demo_pay_015", "demo_o_015", 12900, "PENDING", "pending");

  console.log(`Seeded ${orderIndex} demo orders, ${orderIndex} payments, 3 refunds (demo:true).`);
}

run().catch((e) => {
  console.error("Error seeding:", e);
  process.exit(1);
});
