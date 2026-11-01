/**
 * EMULATOR TEST LANE — deterministic synthetic seed.
 *
 * Runs INSIDE `firebase emulators:exec` (the emulator is already up) and:
 *   1. refuses any target that is not demo-burgonomics-emulator @ 127.0.0.1:8099;
 *   2. verifies the canonical Firestore rules hash (customer copy == backend copy)
 *      BEFORE touching data, and aborts on divergence;
 *   3. wipes this isolated demo project and writes the seed with security rules
 *      DISABLED (the only place writes are allowed);
 *   4. re-reads everything as an UNAUTHENTICATED guest through the real client SDK
 *      so the browser assertions compare UI against emulator truth, not against a
 *      fixture hardcoded in the test;
 *   5. proves a guest write is DENIED (rules are actually loaded, not "allow all");
 *   6. writes `seed-proof.json` for the Playwright spec and the manifest.
 *
 * No Admin SDK, no service account, no ADC, no `.env`, no credentials.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, "../..");

const PROJECT_ID = "demo-burgonomics-emulator";
const HOST = "127.0.0.1";
const PORT = 8099;

const RULES_PATH = path.join(PROJECT_ROOT, "firestore.rules");
const CANONICAL_RULES_PATH =
  process.env.EMULATOR_CANONICAL_RULES ??
  path.resolve(PROJECT_ROOT, "..", "polish-backend-20261025", "firestore.rules");

const ARTIFACTS_DIR =
  process.env.EMULATOR_LANE_ARTIFACTS ??
  path.join(os.tmpdir(), "opencode", "phase1-emulator-browser");

const LABEL = "EMULATOR ONLY";
const BRAND_IMAGE = "/burgonomics-logo.png"; // existing brand asset, not a food photo

const ALPHA_STORE_ID = "emu-store-alpha";
const BETA_STORE_ID = "emu-store-beta";
const ALPHA_REST_ID = "emulator-rest-alpha";
const BETA_REST_ID = "emulator-rest-beta";
const ALPHA_BRANCH_ID = "emulator-branch-alpha";
const BETA_BRANCH_ID = "emulator-branch-beta";

/** 3 derived categories x 16 items = 48 alpha records; every 8th item is 86'd. */
const CATEGORIES = [
  { id: "emu_cat_burgers", name: `${LABEL} — Burgers`, prefix: "Test Burger" },
  { id: "emu_cat_sides", name: `${LABEL} — Sides`, prefix: "Test Side" },
  { id: "emu_cat_drinks", name: `${LABEL} — Drinks`, prefix: "Test Drink" },
];
const ITEMS_PER_CATEGORY = 16;
const TOTAL_ALPHA_PRODUCTS = CATEGORIES.length * ITEMS_PER_CATEGORY;
const BETA_SENTINELS = 3;

function fail(message) {
  process.stderr.write(`[seed] BLOCKED: ${message}\n`);
  process.exit(2);
}

function pad3(n) {
  return String(n).padStart(3, "0");
}

function assertTarget() {
  if (PROJECT_ID !== "demo-burgonomics-emulator") fail("seed project id drifted");
  if (!/^demo-[a-z0-9-]+$/.test(PROJECT_ID)) fail(`project is not a demo project: ${PROJECT_ID}`);
  if (HOST !== "127.0.0.1") fail(`host is not loopback: ${HOST}`);
  if (PORT !== 8099) fail(`port is not the lane port: ${PORT}`);
}

async function sha256(filePath) {
  const bytes = await readFile(filePath);
  return { sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(), bytes: bytes.length };
}

/** Customer copy must equal the explicit canonical path; never silently fall back. */
async function verifyRules() {
  let customer;
  try {
    customer = await sha256(RULES_PATH);
  } catch {
    fail(`customer firestore.rules not found at ${RULES_PATH}`);
  }
  let canonical;
  try {
    canonical = await sha256(CANONICAL_RULES_PATH);
  } catch {
    fail(
      `canonical backend rules not found at ${CANONICAL_RULES_PATH}. ` +
        "Set EMULATOR_CANONICAL_RULES to the backend worktree's firestore.rules.",
    );
  }
  if (customer.sha256 !== canonical.sha256) {
    fail(
      `rules divergence: customer ${customer.sha256} (${customer.bytes}B) != ` +
        `canonical ${canonical.sha256} (${canonical.bytes}B)`,
    );
  }
  return {
    customerPath: RULES_PATH,
    customerSha256: customer.sha256,
    canonicalPath: CANONICAL_RULES_PATH,
    canonicalSha256: canonical.sha256,
    bytes: customer.bytes,
    parity: true,
  };
}

function storeDoc({ name, address, city, area, lat, lng, restId }) {
  return {
    name,
    address,
    city,
    area,
    lat,
    lng,
    phone: "+910000000000",
    imageUrl: BRAND_IMAGE,
    hours: { open: "00:00", close: "23:59" },
    isOpen: true,
    supports: { delivery: true, takeaway: true, dineIn: true },
    etaMinutes: 20,
    pickupEtaMinutes: 15,
    deliveryRadiusKm: 50,
    petpoojaRestId: restId,
    partnerBranchId: null,
    pricing: {
      deliveryFeeFlat: 0,
      gstRate: 5,
      packingChargePerItem: 0,
      minOrderAmount: 0,
    },
  };
}

function productDoc({ id, name, category, inStock, restId, branchId, index }) {
  return {
    id,
    petpoojaItemId: `emu-${pad3(index)}`,
    name,
    description: "Synthetic local-emulator record. Not a real menu item.",
    price: 100,
    categoryId: category.id,
    categoryName: category.name,
    imageUrl: BRAND_IMAGE,
    inStock,
    isVeg: true,
    branchId,
    restId,
  };
}

/** Deterministic ids + shapes; no tags, discounts, badges, customizations or allergen claims. */
function buildAlphaProducts() {
  const products = [];
  for (let i = 1; i <= TOTAL_ALPHA_PRODUCTS; i += 1) {
    const category = CATEGORIES[Math.floor((i - 1) / ITEMS_PER_CATEGORY)];
    const id = `prod_${ALPHA_REST_ID}_emu-${pad3(i)}`;
    products.push(
      productDoc({
        id,
        name: `${LABEL} — ${category.prefix} ${pad3(i)}`,
        category,
        // Every 8th record (008, 016, ..., 048) is out of stock.
        inStock: i % 8 !== 0,
        restId: ALPHA_REST_ID,
        branchId: ALPHA_BRANCH_ID,
        index: i,
      }),
    );
  }
  return products;
}

function buildBetaProducts() {
  const category = { id: "emu_cat_beta", name: `${LABEL} — Beta` };
  return Array.from({ length: BETA_SENTINELS }, (_, idx) => {
    const n = idx + 1;
    const id = `prod_${BETA_REST_ID}_emu-b${String(n).padStart(2, "0")}`;
    return productDoc({
      id,
      name: `${LABEL} — Beta Sentinel B${String(n).padStart(2, "0")}`,
      category,
      inStock: true,
      restId: BETA_REST_ID,
      branchId: BETA_BRANCH_ID,
      index: n,
    });
  });
}

function categoryNamesById(products) {
  const map = new Map();
  for (const product of products) map.set(product.categoryId, product.categoryName);
  return map;
}

async function main() {
  assertTarget();
  const rules = await verifyRules();
  const rulesSource = await readFile(RULES_PATH, "utf8");
  if (rulesSource.trim().length === 0) fail("canonical rules file is empty");

  const alphaProducts = buildAlphaProducts();
  const betaProducts = buildBetaProducts();

  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: HOST, port: PORT, rules: rulesSource },
  });

  // Isolated demo project: start from a known-empty state every run.
  await testEnv.clearFirestore();

  const alphaStore = storeDoc({
    name: `${LABEL} — Test Kitchen Alpha`,
    address: `${LABEL} — 1 Synthetic Lane`,
    city: `${LABEL} City`,
    area: `${LABEL} Area`,
    lat: 12.0,
    lng: 77.0,
    restId: ALPHA_REST_ID,
  });
  const betaStore = storeDoc({
    name: `${LABEL} — Test Kitchen Beta`,
    address: `${LABEL} — 2 Synthetic Lane`,
    city: `${LABEL} — City B`,
    area: `${LABEL} — Area B`,
    lat: 12.001,
    lng: 77.001,
    restId: BETA_REST_ID,
  });

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "stores", ALPHA_STORE_ID), alphaStore);
    await setDoc(doc(db, "stores", BETA_STORE_ID), betaStore);
    for (const product of alphaProducts) {
      await setDoc(doc(db, "products", product.id), product);
    }
    for (const product of betaProducts) {
      await setDoc(doc(db, "products", product.id), product);
    }
  });

  // ---- Guest read-back through the real client SDK (rules enforced) ----------
  const guest = testEnv.unauthenticatedContext();
  const guestDb = guest.firestore();

  const storesSnap = await getDocs(collection(guestDb, "stores"));
  const alphaSnap = await getDocs(
    query(collection(guestDb, "products"), where("restId", "==", ALPHA_REST_ID)),
  );
  const betaSnap = await getDocs(
    query(collection(guestDb, "products"), where("restId", "==", BETA_REST_ID)),
  );
  const alphaStoreSnap = await getDoc(doc(guestDb, "stores", ALPHA_STORE_ID));

  const storeIds = storesSnap.docs.map((d) => d.id).sort();
  const alphaDocs = alphaSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const betaDocs = betaSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const crossLeak = alphaDocs.filter((d) => d.restId !== ALPHA_REST_ID).length;

  let guestWriteDenied = false;
  try {
    await assertFails(
      setDoc(doc(guestDb, "products", "prod_emulator-rest-alpha_guest-write-probe"), {
        name: "guest write probe",
      }),
    );
    guestWriteDenied = true;
  } catch {
    guestWriteDenied = false;
  }

  // Basic invariants before we call the seed good.
  const problems = [];
  if (storeIds.length !== 2) problems.push(`expected 2 stores, read ${storeIds.length}`);
  if (!storeIds.includes(ALPHA_STORE_ID) || !storeIds.includes(BETA_STORE_ID)) {
    problems.push(`store ids mismatch: ${storeIds.join(",")}`);
  }
  if (alphaDocs.length !== TOTAL_ALPHA_PRODUCTS) {
    problems.push(`expected ${TOTAL_ALPHA_PRODUCTS} alpha products, read ${alphaDocs.length}`);
  }
  if (betaDocs.length !== BETA_SENTINELS) {
    problems.push(`expected ${BETA_SENTINELS} beta products, read ${betaDocs.length}`);
  }
  if (crossLeak !== 0) problems.push(`alpha query leaked ${crossLeak} foreign restId docs`);
  if (!guestWriteDenied) problems.push("guest write was NOT denied — rules are not enforced");
  const outOfStock = alphaDocs.filter((d) => d.inStock === false);
  if (outOfStock.length !== TOTAL_ALPHA_PRODUCTS / 8) {
    problems.push(`expected ${TOTAL_ALPHA_PRODUCTS / 8} out-of-stock, read ${outOfStock.length}`);
  }
  const readAlphaRestId = alphaStoreSnap.data()?.petpoojaRestId;
  if (readAlphaRestId !== ALPHA_REST_ID) {
    problems.push(`alpha store petpoojaRestId is ${String(readAlphaRestId)}`);
  }
  if (problems.length > 0) {
    await testEnv.cleanup();
    fail(`seed verification failed: ${problems.join("; ")}`);
  }

  // Category truth as the emulator itself reports it (drives the UI assertions).
  const categoryNames = categoryNamesById(alphaDocs);
  const categories = CATEGORIES.map((category) => {
    const items = alphaDocs
      .filter((d) => d.categoryId === category.id)
      .sort((a, b) => a.id.localeCompare(b.id));
    const soldOut = items.filter((d) => d.inStock === false);
    return {
      id: category.id,
      name: categoryNames.get(category.id),
      count: items.length,
      ids: items.map((d) => d.id),
      names: items.map((d) => d.name),
      outOfStockIds: soldOut.map((d) => d.id),
      outOfStockNames: soldOut.map((d) => d.name),
    };
  });
  const outOfStockIds = outOfStock.map((d) => d.id).sort();

  const proof = {
    lane: "guest-catalog-browser",
    generatedAt: new Date().toISOString(),
    projectId: PROJECT_ID,
    host: HOST,
    port: PORT,
    label: "EMULATOR TEST — synthetic data, not live",
    rules,
    stores: [
      {
        id: ALPHA_STORE_ID,
        name: alphaStore.name,
        restId: ALPHA_REST_ID,
        lat: alphaStore.lat,
        lng: alphaStore.lng,
      },
      {
        id: BETA_STORE_ID,
        name: betaStore.name,
        restId: BETA_REST_ID,
        lat: betaStore.lat,
        lng: betaStore.lng,
      },
    ],
    alpha: {
      storeId: ALPHA_STORE_ID,
      restId: ALPHA_REST_ID,
      productCount: alphaDocs.length,
      categoryCount: categories.length,
      categories,
      outOfStockIds,
      outOfStockCount: outOfStockIds.length,
      firstProductId: alphaDocs.map((d) => d.id).sort()[0],
      lastProductId: alphaDocs.map((d) => d.id).sort().at(-1),
      burgerNames: alphaDocs
        .filter((d) => d.categoryId === "emu_cat_burgers")
        .map((d) => d.name)
        .sort(),
    },
    beta: {
      storeId: BETA_STORE_ID,
      restId: BETA_REST_ID,
      productCount: betaDocs.length,
      names: betaDocs.map((d) => d.name).sort(),
      ids: betaDocs.map((d) => d.id).sort(),
    },
    guestReadProof: {
      stores: storesSnap.size,
      alpha: alphaSnap.size,
      beta: betaSnap.size,
      crossRestIdLeak: crossLeak,
      guestWriteDenied,
    },
    queryProof: [
      { collection: "stores", where: null, count: storesSnap.size },
      { collection: "products", where: `restId == ${ALPHA_REST_ID}`, count: alphaSnap.size },
      { collection: "products", where: `restId == ${BETA_REST_ID}`, count: betaSnap.size },
    ],
  };

  await mkdir(ARTIFACTS_DIR, { recursive: true });
  await writeFile(
    path.join(ARTIFACTS_DIR, "seed-proof.json"),
    `${JSON.stringify(proof, null, 2)}\n`,
    "utf8",
  );

  process.stdout.write(
    `[seed] OK stores=${storesSnap.size} alpha=${alphaSnap.size} beta=${betaSnap.size} ` +
      `categories=${categories.length} outOfStock=${outOfStockIds.length} ` +
      `guestWriteDenied=${guestWriteDenied} rules=${rules.customerSha256.slice(0, 12)}…\n`,
  );

  // cleanup() destroys client contexts only; it does NOT clear emulator data
  // (verified in @firebase/rules-unit-testing typing). Data must survive for the browser.
  await testEnv.cleanup();
}

main().catch(async (error) => {
  process.stderr.write(`[seed] FAILED: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
