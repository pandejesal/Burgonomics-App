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
import { getFirestore } from "firebase-admin/firestore";
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

  console.log("Seeding Admin Stores (17 Outlets)...");
  const adminStoresRef = db.collection("admin_stores");
  for (const store of INITIAL_RICH_STORES) {
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
      latitude: store.lat || (store as any).location?.latitude || null,
      longitude: store.lng || (store as any).location?.longitude || null,
      minPrepMinutes: 15,
      distanceKm: 0,
      turnOnAt: null,
      updatedAt: new Date().toISOString(),
    };
    await adminStoresRef.doc(store.id).set(storeData);
  }

  console.log("Successfully seeded all categories, products, and 17 admin stores to Firestore!");
  process.exit(0);
}

run().catch((e) => {
  console.error("Error seeding:", e);
  process.exit(1);
});
