import fs from "node:fs";

const env = fs.readFileSync(".env", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Za-z0-9_]+)=/);
  if (m) {
    const val = line.slice(line.indexOf("=") + 1).trim();
    const redacted = /KEY|SECRET|TOKEN|PASS|ACCOUNT|API/i.test(m[1])
      ? val.length > 0
        ? `<set:${val.length} chars>`
        : "<empty>"
      : val || "<empty>";
    console.log(`${m[1]}=${redacted}`);
  }
}