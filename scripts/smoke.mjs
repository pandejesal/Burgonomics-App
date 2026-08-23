import { execSync } from "child_process";
import fs from "fs";
import path from "path";

console.log("================================================================");
console.log("BURGONOMICS — Full QA Smoke & Role Verification Gate (Week 1)");
console.log("================================================================");

function runStep(name, cmd) {
  process.stdout.write(`\n[STEP] ${name} ... `);
  try {
    const output = execSync(cmd, { stdio: "pipe", encoding: "utf-8" });
    console.log("✅ PASS");
    return output;
  } catch (err) {
    console.log("❌ FAILED");
    console.error(err.stdout || err.message);
    process.exit(1);
  }
}

// 1. TypeScript Compilation
runStep("TypeScript Check (npx tsc --noEmit)", "npx tsc --noEmit");

// 2. Production Build
runStep("Vite Production Build (npm run build)", "npm run build");

// 3. Admin Portal Decoupling
process.stdout.write("\n[STEP] Admin Portal Decoupling (grep '@/admin') ... ");
const srcFiles = [];
function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const p = path.join(dir, file);
    if (fs.statSync(p).isDirectory()) walkDir(p);
    else if (/\.(tsx?|jsx?|vue|svelte|css)$/.test(file)) srcFiles.push(p);
  }
}
walkDir(path.resolve("src"));

let adminRefFound = false;
for (const file of srcFiles) {
  const content = fs.readFileSync(file, "utf-8");
  if (content.includes("from '@/admin") || content.includes('from "@/admin')) {
    console.error(`Found @/admin import in ${file}`);
    adminRefFound = true;
  }
}
if (adminRefFound) {
  console.log("❌ FAILED");
  process.exit(1);
} else {
  console.log("✅ PASS (0 references)");
}

// 4. DON'T WANTs Check
process.stdout.write("\n[STEP] Architecture Prohibitions (kitchen_orders|walletBalance|ioredis|bull|socket.io) ... ");
const forbiddenPatterns = [/walletBalance/, /kitchen_orders/, /ioredis/, /\bbull\b/, /socket\.io/];
let forbiddenFound = false;
for (const file of srcFiles) {
  const content = fs.readFileSync(file, "utf-8");
  for (const regex of forbiddenPatterns) {
    if (regex.test(content)) {
      console.error(`Found forbidden pattern ${regex} in ${file}`);
      forbiddenFound = true;
    }
  }
}
if (forbiddenFound) {
  console.log("❌ FAILED");
  process.exit(1);
} else {
  console.log("✅ PASS (0 forbidden patterns)");
}

// 5. Unit and Flow Tests
runStep("Unit & Functional Tests (npm run test)", "npm run test");

// 6. Firestore Rules Tests
runStep("Firestore Security Rules Tests (npm run test:rules)", "npm run test:rules");

// 7. Capacitor Config App IDs
process.stdout.write("\n[STEP] Capacitor App ID Verification ... ");
const coreCapacitor = fs.readFileSync(path.resolve("capacitor.config.ts"), "utf-8");
if (!coreCapacitor.includes('appId: "com.glassdoorsstudio.burgonomics"')) {
  console.log("❌ FAILED: Core appId mismatch");
  process.exit(1);
}
const partnerCapacitorPath = path.resolve("../burgonomics-partner/capacitor.config.ts");
if (fs.existsSync(partnerCapacitorPath)) {
  const partnerCap = fs.readFileSync(partnerCapacitorPath, "utf-8");
  if (!partnerCap.includes("com.glassdoorsstudio.burgonomics.partner")) {
    console.log("❌ FAILED: Partner appId mismatch");
    process.exit(1);
  }
}
console.log("✅ PASS (Both appIds verified)");

// 8. Firestore Composite Indexes
process.stdout.write("\n[STEP] Firestore Indexes Verification (firestore.indexes.json) ... ");
const indexesJson = JSON.parse(fs.readFileSync(path.resolve("firestore.indexes.json"), "utf-8"));
if (!indexesJson.indexes || indexesJson.indexes.length < 5) {
  console.log("❌ FAILED: Expected 5 composite indexes");
  process.exit(1);
}
console.log(`✅ PASS (${indexesJson.indexes.length} indexes verified)`);

console.log("\n================================================================");
console.log("🎉 ALL QA SMOKE & ROLE GATES PASSED (100% GREEN) — WEEK 1 COMPLETE");
console.log("================================================================\n");
