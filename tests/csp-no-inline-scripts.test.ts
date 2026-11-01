import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The deployed hosting CSP allows `script-src 'self' …` with no
 * 'unsafe-inline'. An inline theme bootstrap in index.html was blocked on the
 * first page load on staging, so the app painted in the wrong theme. Keep every
 * script external and same-origin.
 */
const html = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");

describe("index.html stays compatible with the hosting CSP", () => {
  it("has no inline <script> blocks", () => {
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) {
      expect(tag, `inline script: ${tag}`).toMatch(/\bsrc=/);
    }
  });

  it("loads the pre-paint theme bootstrap from a same-origin file", () => {
    expect(html).toContain('src="/theme-boot.js"');
    const source = readFileSync(resolve(__dirname, "..", "public", "theme-boot.js"), "utf8");
    expect(source).toContain('root.setAttribute("data-theme", resolved)');
    expect(source).toContain('localStorage.getItem("burg.settings")');
  });

  it("loads no remote fonts or scripts beyond the CSP allowlist", () => {
    // Launch self-hosts fonts; a re-added Google Fonts link would be blocked by
    // the hosting header (font-src 'self').
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
    const external = (html.match(/<script\b[^>]*\bsrc="([^"]+)"/g) ?? []).filter(
      (tag) => !tag.includes('src="/') && !tag.includes('src=".'),
    );
    expect(external).toEqual([]);
  });
});
