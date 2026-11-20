/**
 * Writes `LEGAL-FACTS-NEEDED.md` from the legal content module.
 *
 *   npm run legal:facts          write the file
 *   npm run legal:facts -- --check   exit non-zero when the committed file is stale
 *
 * The markdown itself lives in `src/features/legal/factsMarkdown.ts` so the unit
 * suite can assert the committed file matches the module (a hand-kept list is
 * how a statutory gap ships).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderLegalFactsMarkdown } from "../src/features/legal/factsMarkdown";

const ROOT = resolve(import.meta.dirname, "..");
const TARGET = join(ROOT, "LEGAL-FACTS-NEEDED.md");
const checkMode = process.argv.includes("--check");

if (checkMode) {
  let existing = "";
  try {
    existing = readFileSync(TARGET, "utf8");
  } catch {
    console.error(`legal:facts: ${TARGET} is missing. Run: npm run legal:facts`);
    process.exit(1);
  }
  if (existing !== renderLegalFactsMarkdown()) {
    console.error("legal:facts: LEGAL-FACTS-NEEDED.md is STALE. Run: npm run legal:facts");
    process.exit(1);
  }
  console.log("legal:facts: up to date");
} else {
  writeFileSync(TARGET, renderLegalFactsMarkdown());
  console.log(`legal:facts: wrote ${TARGET}`);
}
