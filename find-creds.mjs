import fs from "node:fs";
import path from "node:path";

const dirs = [
  "C:/Users/DELL/Desktop",
  "C:/Users/DELL/Downloads",
  "C:/Users/DELL/Documents",
  "C:/Users/DELL/AppData/Local/Temp/opencode",
];

const re = /service-account|serviceaccount|razorpay|firebase/i;
for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (re.test(entry.name)) {
      const p = path.join(dir, entry.name);
      console.log(`${p} (${fs.statSync(p).size} bytes)`);
    }
  }
}
console.log("scan done");