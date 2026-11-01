/**
 * A11Y-03 / A11Y-04 — contrast of the checkout bill copy and input placeholders.
 *
 * Computes WCAG 2.2 relative-luminance ratios from the shipped tokens instead
 * of trusting comments:
 *   - A11Y-03: "FREE" was #4ADE80 on white = 1.74:1 and warning copy
 *     #F59E0B on white = 2.15:1. Both now resolve through readable tokens.
 *   - A11Y-04: placeholder copy used --text-disabled (#9CA3AF = 2.54:1 on
 *     white); it now uses --text-placeholder, while --text-disabled stays for
 *     genuinely disabled controls (WCAG exempts those).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const TEXT_AA = 4.5;

function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.replace(/./g, (d) => d + d) : raw;
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const css = read("src/styles.css").replace(/\/\*[\s\S]*?\*\//g, "");

function ruleBody(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  expect(at, `src/styles.css: missing ${selector}`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", at);
  return css.slice(open + 1, css.indexOf("}", open));
}

function token(block: string, name: string): string {
  const m = block.match(new RegExp(`(?:^|[;\\s])${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`));
  if (!m) throw new Error(`src/styles.css: ${name} is not a hex token`);
  return m[1];
}

const root = ruleBody(":root");
const dark = ruleBody(".dark");
const checkout = read("src/routes/checkout.tsx");

describe("A11Y-03 — checkout FREE / warning copy on its real background", () => {
  it("the light FREE green is >= 4.5:1 on the white bill surface", () => {
    // #0E4825 (brand green, used as text in light mode).
    expect(contrast("#0E4825", "#FFFFFF")).toBeGreaterThanOrEqual(TEXT_AA);
  });

  it("the warning text token is >= 4.5:1 on surface and canvas in light mode", () => {
    const warningText = token(root, "--warning-text");
    const surface = token(root, "--surface");
    const background = token(root, "--background");
    expect(contrast(warningText, surface)).toBeGreaterThanOrEqual(TEXT_AA);
    expect(contrast(warningText, background)).toBeGreaterThanOrEqual(TEXT_AA);
    // 8-bit-gamma sanity: it must differ from the decorative #F59E0B.
    expect(warningText.toLowerCase()).not.toBe("#f59e0b");
  });

  it("checkout no longer paints #4ADE80 on white and uses warning-text for copy", () => {
    // Any use of the 1.74:1 green must be dark-mode-only.
    expect(checkout).not.toMatch(/(?<!dark:)text-\[#4ADE80\]/);
    expect(checkout).not.toMatch(/className="text-warning"/);
    expect(checkout).toContain("text-warning-text");
    // Launch markup paints success copy with the semantic token, never the
    // old 1.74:1 raw green anywhere (light or dark).
    expect(checkout).not.toMatch(/#4ADE80/i);
  });
});

describe("A11Y-04 — placeholders carry information", () => {
  it("--text-placeholder clears 4.5:1 on surface and input fill in both themes", () => {
    for (const [name, block] of [
      ["light", root],
      ["dark", dark],
    ] as const) {
      const placeholder = token(block, "--text-placeholder");
      const surface = token(block, "--surface");
      const input = token(block, "--bg-secondary");
      expect(contrast(placeholder, surface), `${name} placeholder on surface`).toBeGreaterThanOrEqual(
        TEXT_AA,
      );
      expect(contrast(placeholder, input), `${name} placeholder on input`).toBeGreaterThanOrEqual(
        TEXT_AA,
      );
    }
  });

  it("informative copy no longer uses the disabled token, placeholders use the new one", () => {
    for (const file of [
      "src/shared/components/common/TextField.tsx",
      "src/shared/components/common/SearchBar.tsx",
      "src/features/cart/components/PromoInput.tsx",
      "src/features/offers/components/CouponInput.tsx",
      "src/routes/search.tsx",
      "src/routes/profile.favorites.tsx",
    ]) {
      expect(read(file), file).not.toContain("placeholder:text-text-disabled");
      expect(read(file), file).toContain("placeholder:text-text-placeholder");
    }
    expect(read("src/features/home/components/ComboCard.tsx")).not.toContain(
      "text-text-disabled",
    );
    expect(read("src/features/cart/components/CartItemRow.tsx")).not.toContain(
      "text-text-disabled",
    );
  });
});
