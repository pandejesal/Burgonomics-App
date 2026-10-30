import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("search focus follows the rounded field, not a rectangular inner input", () => {
  const css = readFileSync("src/styles.css", "utf8");
  const search = readFileSync("src/routes/search.tsx", "utf8");

  it("moves the visible focus indicator to the rounded wrapper without removing global keyboard focus", () => {
    expect(search).toContain('className="search-field ');
    expect(css).toMatch(/\.search-field:focus-within\s*\{[^}]*outline: 2px solid var\(--color-ring\)/);
    expect(css).toMatch(/\.search-field input:focus-visible\s*\{[^}]*outline: none !important/);
    expect(css).toContain("*:focus-visible");
    expect(search).toContain("min-w-0");
  });
});
