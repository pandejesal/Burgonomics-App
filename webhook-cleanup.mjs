import fs from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const sa = JSON.parse(
  fs.readFileSync("C:/Users/DELL/AppData/Local/Temp/opencode/creds/service-account.json", "utf8"),
);
initializeApp({ credential: cert(sa) });
const db = getFirestore();
await db.collection("settlements").doc("setl_test_harness_1").delete();
await db.collection("payments").doc("pay_fake_failed_1").delete();
console.log("deleted fake settlement + fake failed payment docs");
process.exit(0);
