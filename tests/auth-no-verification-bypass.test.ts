/**
 * Release guard: no production source file may reference a Firebase Auth
 * verification bypass or an emulator connection. Those let phone sign-in
 * "succeed" without a real SMS or a real project, which would make the auth
 * story untrustworthy if they ever shipped.
 *
 * The guard walks every .ts and .tsx file under `src/` with plain `node:fs`, so
 * it does not depend on any package beyond Node itself.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC_ROOT = join(__dirname, "..", "src");

const FORBIDDEN = ["appVerificationDisabledForTesting", "connectAuthEmulator"] as const;

/** Read every source file exactly once: the guard must stay well under the
 *  unchanged 5 s per-test timeout. */
const SOURCES: Array<{ file: string; content: string }> = (() => {
  const out: Array<{ file: string; content: string }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.(ts|tsx)$/.test(entry)) out.push({ file: full, content: readFileSync(full, "utf8") });
    }
  };
  walk(SRC_ROOT);
  return out;
})();

describe("release guard: no auth verification bypass in src/", () => {
  it("finds source files to scan", () => {
    expect(SOURCES.length).toBeGreaterThan(0);
  });

  for (const forbidden of FORBIDDEN) {
    it(`no source file contains '${forbidden}'`, () => {
      const hits = SOURCES.filter((source) => source.content.includes(forbidden)).map((source) =>
        source.file.slice(SRC_ROOT.length + 1).replace(/\\/g, "/"),
      );
      expect(hits, `Files containing '${forbidden}'`).toEqual([]);
    });
  }
});
