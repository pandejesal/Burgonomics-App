/**
 * Legal identity follows the GST registration: PANCHTATVA FOODS, trading as
 * Burgonomics. The app must not print the previous names ("Burgonomics Foods
 * Pvt Ltd", "Glassdoors") anywhere a customer can see them.
 *
 * This scans the CUSTOMER-VISIBLE sources — every route, every shared/feature
 * component, the app shell HTML and the public assets — and fails on either
 * name. Names are written from APP.legalEntity / APP.tradeName /
 * APP.registeredAddress, never retyped.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { APP } from "../src/core/constants/app";

const ROOT = process.cwd();

/** Directories whose content can reach a customer's screen. */
const SCANNED_ROOTS = ["src/routes", "src/shared", "src/features", "src/core", "public"];
const SCANNED_FILES = ["index.html"];

function walk(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out = out.concat(walk(full));
    } else if (/\.(tsx?|jsx?|html|json|md)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function scannedFiles(): string[] {
  const files = SCANNED_ROOTS.flatMap((root) => walk(join(ROOT, root)));
  for (const file of SCANNED_FILES) {
    try {
      statSync(join(ROOT, file));
      files.push(join(ROOT, file));
    } catch {
      // Optional root; nothing to scan.
    }
  }
  return files;
}

const FORBIDDEN = ["Burgonomics Foods Pvt Ltd", "Glassdoors"];

describe("legal identity — the registered entity is the only name used", () => {
  it("ships the registered entity, trade name and address in APP", () => {
    expect(APP.legalEntity).toBe("PANCHTATVA FOODS");
    expect(APP.tradeName).toBe("Burgonomics");
    expect(APP.registeredAddress.trim().length).toBeGreaterThan(0);
  });

  it("no customer-visible source names the previous entity or studio", () => {
    const offenders: string[] = [];
    for (const file of scannedFiles()) {
      const text = readFileSync(file, "utf8");
      for (const name of FORBIDDEN) {
        if (text.includes(name)) offenders.push(`${relative(ROOT, file)}: "${name}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
