/**
 * Tests that FIREBASE_APPCHECK_DEBUG_TOKEN is not set when import.meta.env.DEV
 * is false, even on localhost.
 *
 * We test this by scanning the source code rather than executing it, because
 * firebase.ts has side effects that make re-importing impractical and the
 * debug token assignment is straightforward enough that a source assertion is
 * reliable.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("App Check debug token guard", () => {
  const firebaseSrc = readFileSync(
    join(__dirname, "..", "src", "core", "config", "firebase.ts"),
    "utf8",
  );

  it("gates FIREBASE_APPCHECK_DEBUG_TOKEN on import.meta.env.DEV, not just hostname", () => {
    // The assignment line must be guarded by import.meta.env.DEV
    expect(firebaseSrc).toContain("import.meta.env.DEV");

    // Find lines referencing FIREBASE_APPCHECK_DEBUG_TOKEN
    const lines = firebaseSrc.split("\n");
    const assignmentLineIdx = lines.findIndex((l) => l.includes("FIREBASE_APPCHECK_DEBUG_TOKEN"));
    expect(assignmentLineIdx).toBeGreaterThan(-1);

    // The guard must appear on a line before the assignment.
    // Find the nearest conditional before the assignment line.
    let guardFound = false;
    for (let i = assignmentLineIdx; i >= Math.max(0, assignmentLineIdx - 3); i--) {
      if (lines[i].includes("import.meta.env.DEV")) {
        guardFound = true;
        break;
      }
    }
    expect(guardFound, "import.meta.env.DEV guard must precede the debug token assignment").toBe(
      true,
    );
  });

  it("does not set FIREBASE_APPCHECK_DEBUG_TOKEN with only a hostname check", () => {
    // Before the fix, the condition was:
    //   if (window.location.hostname === "localhost") {
    //     (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    //   }
    // After the fix, DEV must also be required. Ensure there is no
    // standalone hostname-only guard for the debug token.
    const lines = firebaseSrc.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("FIREBASE_APPCHECK_DEBUG_TOKEN")) {
        // Look at the conditional on the lines just before
        let hasDevGuard = false;
        for (let j = i; j >= Math.max(0, i - 3); j--) {
          if (lines[j].includes("import.meta.env.DEV")) {
            hasDevGuard = true;
            break;
          }
        }
        expect(
          hasDevGuard,
          `FIREBASE_APPCHECK_DEBUG_TOKEN at line ${i + 1} must be guarded by import.meta.env.DEV`,
        ).toBe(true);
      }
    }
  });
});
