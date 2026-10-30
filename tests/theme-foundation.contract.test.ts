import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles.css", "utf8");
const rootSource = readFileSync("src/routes/__root.tsx", "utf8");

function tokenBlock(selector: string): string {
  const match = new RegExp(`(?:^|\\n)${selector.replace(".", "\\.")} \\{`).exec(css);
  if (!match) throw new Error(`Missing ${selector} block`);
  const start = match.index + match[0].length;
  const end = css.indexOf("}", start);
  if (end < 0) throw new Error(`Unterminated ${selector} block`);
  return css.slice(start, end);
}

function token(block: string, name: string): string {
  const value = block.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})\\s*;`))?.[1];
  if (!value) throw new Error(`Missing --${name}`);
  return value.toUpperCase();
}

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((pair) => parseInt(pair, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const light = tokenBlock(":root");
const dark = tokenBlock(".dark");

describe("theme foundation contract", () => {
  it("keeps white/black canvases and forest green as the primary action colour", () => {
    expect(token(light, "background")).toBe("#FFFFFF");
    expect(token(dark, "background")).toBe("#000000");
    expect(token(light, "primary")).toBe("#0E4825");
    expect(token(dark, "brand")).toBe("#1B6B3A");
    expect(css).not.toContain("#F5F5F5");
  });

  it.each([
    ["light", light],
    ["dark", dark],
  ])("passes text contrast in the %s theme", (_name, block) => {
    const background = token(block, "background");
    const surface = token(block, "surface");

    for (const name of ["text-primary", "text-secondary"]) {
      const text = token(block, name);
      expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(text, surface)).toBeGreaterThanOrEqual(4.5);
    }

    for (const [foreground, backgroundToken] of [
      ["primary-foreground", "primary"],
      ["accent-foreground", "accent"],
      ["error-foreground", "error"],
    ] as const) {
      expect(
        contrast(token(block, foreground), token(block, backgroundToken)),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each([
    ["light", light],
    ["dark", dark],
  ])("keeps control and focus indicators at 3:1 or better in the %s theme", (_name, block) => {
    expect(contrast(token(block, "ring"), token(block, "background"))).toBeGreaterThanOrEqual(3);
    expect(contrast(token(block, "primary"), token(block, "background"))).toBeGreaterThanOrEqual(3);
  });

  it("uses MonstroSolid headings, bold Montserrat subheads and regular Montserrat content", () => {
    expect(css).toContain('--font-sans: "Montserrat"');
    expect(css).toContain('--font-display: "MonstroSolid"');
    expect(css).toContain('--font-mono: "Montserrat"');
    expect(css).toContain('url("/fonts/MontserratVariable.woff2")');
    expect(css).toContain("font-weight: 100 900");
    expect(css).toContain("font-display: swap");
    expect(css).not.toContain("fonts.googleapis");
    expect(css).toContain(".type-brand-heading");
    expect(css).toMatch(/\.type-brand-heading \{[\s\S]*?font-family: var\(--font-brand\)/);
    for (const role of ["type-body", "type-caption", "type-button", "type-price", "type-label-large"]) {
      expect(css).toMatch(new RegExp(`\\.${role} \\{[\\s\\S]*?font-family: var\\(--font-sans\\)`));
    }
    for (const role of ["type-title", "type-title-large", "type-title-medium", "type-subheading"]) {
      expect(tokenBlock(`.${role}`)).toContain("font-family: var(--font-sans)");
      expect(tokenBlock(`.${role}`)).toContain("font-weight: 700");
    }
    for (const role of ["type-body", "type-caption", "type-body-large", "type-body-medium"]) {
      expect(tokenBlock(`.${role}`)).toContain("font-weight: 400");
    }
    const montserrat = readFileSync("public/fonts/MontserratVariable.woff2");
    expect(montserrat.subarray(0, 4).toString()).toBe("wOF2");
    expect(readFileSync("public/fonts/Montserrat-OFL.txt", "utf8"))
      .toContain("SIL OPEN FONT LICENSE Version 1.1");
  });

  it("preserves the existing Inter asset and licence bytes", () => {
    const font = readFileSync("public/fonts/InterVariable.woff2");
    const licence = readFileSync("public/fonts/Inter-OFL.txt");
    expect(font.byteLength).toBe(352240);
    expect(createHash("sha256").update(font).digest("hex").toUpperCase()).toBe(
      "693B77D4F32EE9B8BFC995589B5FAD5E99ADF2832738661F5402F9978429A8E3",
    );
    expect(createHash("sha256").update(licence).digest("hex").toUpperCase()).toBe(
      "262481E844521B326F5ECD053E59B98C8B2DA78C8EE1BDBB6E8174305E54935A",
    );
  });

  it("routes appearance through one root authority and loads no remote fonts", () => {
    expect(rootSource).toContain("bootstrapThemeAuthority");
    expect(rootSource).toContain("applyThemePreference");
    expect(rootSource).toContain("watchSystemTheme");
    expect(rootSource).toContain("suppressHydrationWarning");
    expect(rootSource).toContain("/fonts/MontserratVariable.woff2");
    expect(rootSource).toContain("/fonts/MonstroSolid.woff2");
    expect(rootSource).not.toContain("fonts.googleapis.com");
    expect(rootSource).not.toContain("fonts.gstatic.com");
  });
});
