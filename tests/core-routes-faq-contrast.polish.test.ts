import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/routes/support.tsx", "utf8");
const css = readFileSync("src/styles.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function luminance(hex: string): number {
  const channels = hex.slice(1).match(/.{2}/g)!.map((value) => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

describe("FAQ semantic text contrast", () => {
  it.each([
    ["question", "text-text"],
    ["category", "text-text-secondary"],
    ["answer", "text-text-secondary"],
  ])("uses the theme token for the %s", (field, token) => {
    const classes = source.match(new RegExp(`<[^>]+className="([^"]+)"[^>]*>\\s*\\{item\\.${field}\\}`))?.[1].split(/\s+/);
    expect(classes).toContain(token);
    expect(classes).not.toContain("text-white");
    expect(classes).not.toContain("text-neutral-300");
    expect(classes).not.toContain("text-neutral-400");
  });

  it.each([":root", ".dark"])("passes 4.5:1 for both FAQ text tokens in %s", (selector) => {
    const start = css.indexOf(`${selector} {`);
    expect(start).toBeGreaterThanOrEqual(0);
    const block = css.slice(start, css.indexOf("}", start));
    const token = (name: string) => {
      const value = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`))?.[1];
      expect(value).toBeDefined();
      return value!;
    };
    for (const name of ["--text-primary", "--text-secondary"]) {
      const text = luminance(token(name));
      const surface = luminance(token("--surface"));
      expect((Math.max(text, surface) + 0.05) / (Math.min(text, surface) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
    expect(css).toContain("--color-text: var(--text-primary)");
    expect(css).toContain("--color-text-secondary: var(--text-secondary)");
  });
});
