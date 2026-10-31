/**
 * Text-encoding guard for the cart route.
 *
 * Commit 3f79ba4 re-encoded `src/routes/cart.tsx` with PowerShell: a UTF-8 BOM
 * was prepended and every non-ASCII character was double-encoded, so customers
 * would have read a mangled tab title, broken emoji badges and a garbled
 * "Recalculating" label. This test fails on that damage.
 *
 * The mojibake fragments are BUILT FROM CODE POINTS so this guard file itself
 * contains no double-encoded characters.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CART = fileURLToPath(new URL("../src/routes/cart.tsx", import.meta.url));

const MOJIBAKE = [
  String.fromCharCode(0x00e2, 0x20ac), // euros-sign mis-decode of UTF-8 punctuation
  String.fromCharCode(0x00f0, 0x0178), // emoji surrogate bytes read as latin-1
  String.fromCharCode(0x00c3),
  String.fromCharCode(0x00c2),
];

describe("cart route text encoding", () => {
  it("has no BOM and no double-encoded text", () => {
    const bytes = readFileSync(CART);
    expect(
      bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf,
      "src/routes/cart.tsx must not start with a UTF-8 BOM",
    ).toBe(false);

    const text = bytes.toString("utf8");
    for (const seq of MOJIBAKE) {
      expect(text, "double-encoded text in src/routes/cart.tsx").not.toContain(seq);
    }

    // The real characters must still be there, exactly.
    expect(text).toContain("Your Cart " + String.fromCharCode(0x2014) + " Burgonomics");
    expect(text).toContain(String.fromCodePoint(0x1f6f5) + " Delivery");
    expect(text).toContain(String.fromCodePoint(0x1f4e6));
    expect(text).toContain("Recalculating" + String.fromCharCode(0x2026));
  });
});
