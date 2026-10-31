/**
 * B01 — semantic token accessibility (customer app, global stylesheet only).
 *
 * Owns: `src/styles.css` token / focus / reduced-motion / viewport blocks.
 * Reads them as *source of truth* — every hex below is parsed out of the
 * shipped stylesheet, never hand-copied — and checks the WCAG 2.2 ratios the
 * tokens are supposed to guarantee:
 *
 *   - CTA pair  `--accent` (fill) + `--accent-foreground` (label on it) >= 4.5:1
 *   - text pair `--accent-text` (orange text on a surface)               >= 4.5:1
 *   - focus ring `--ring` against every surface of its theme             >= 3:1
 *   - the keyboard focus rule is not gated behind a fine-pointer media query
 *   - decorative / legacy oranges (#FF6600 brand mark, #EF6124, gradient
 *     stops) are never promoted into a text-bearing token
 *
 * Also pins the parent-owned invariants this lane must not disturb:
 * `overflow-x: clip`, the route-transition fill-mode/will-change contract
 * (R04 / 05-02), the reduced-motion kill switch, and the fixed-footer
 * safe-area helpers.
 *
 * Thresholds only. No WCAG conformance claim, no device/AT evidence.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const TEXT_AA = 4.5; // SC 1.4.3, normal-size text
const NONTEXT_AA = 3; // SC 1.4.11, controls / focus indication

/* -------------------------------------------------------------------------- */
/* WCAG 2.x contrast math (sRGB relative luminance)                           */
/* -------------------------------------------------------------------------- */

function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.replace(/./g, (d) => d + d) : raw;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/* -------------------------------------------------------------------------- */
/* Source-anchored token extraction                                            */
/* -------------------------------------------------------------------------- */

function repoFile(rel: string): string {
  const candidates = [resolve(process.cwd(), rel), resolve(process.cwd(), "burgonomics-foundation-core", rel)];
  const hit = candidates.find((c) => existsSync(c));
  if (!hit) throw new Error(`B01 fixture: cannot locate ${rel} under ${process.cwd()}`);
  return hit;
}

const stylesCss = readFileSync(repoFile("src/styles.css"), "utf8");

/** Comments are prose: structural checks must not match text inside them. */
const css = stylesCss.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Body of the first rule whose selector matches.
 * The selector must end with `{` (or pass `exact`) — `@custom-variant dark
 * (&:is(.dark *))` mentions `.dark` long before the real `.dark {` block.
 */
function ruleBody(selector: string, from = 0, exact = false): string {
  const needle =
    exact || selector.trimEnd().endsWith("{") ? selector : `${selector} {`;
  const at = css.indexOf(needle, from);
  expect(at, `src/styles.css: missing "${needle}"`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function token(block: string, name: string): string {
  const m = block.match(new RegExp(`(?:^|[;\\s])${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`));
  if (!m) throw new Error(`src/styles.css: ${name} is not a hex token`);
  return m[1];
}

const rootBlock = ruleBody(":root");
const darkBlock = ruleBody(".dark");
const themeBlock = ruleBody("@theme inline");

const light = {
  accent: token(rootBlock, "--accent"),
  accentHover: token(rootBlock, "--accent-hover"),
  onAccent: token(rootBlock, "--accent-foreground"),
  accentText: token(rootBlock, "--accent-text"),
  ring: token(rootBlock, "--ring"),
  background: token(rootBlock, "--background"),
  surface: token(rootBlock, "--surface"),
  surfaceElevated: token(rootBlock, "--surface-elevated"),
  bgSecondary: token(rootBlock, "--bg-secondary"),
};

const dark = {
  accent: token(darkBlock, "--accent"),
  accentHover: token(darkBlock, "--accent-hover"),
  onAccent: token(darkBlock, "--accent-foreground"),
  accentText: token(darkBlock, "--accent-text"),
  ring: token(darkBlock, "--ring"),
  background: token(darkBlock, "--background"),
  surface: token(darkBlock, "--surface"),
  surfaceElevated: token(darkBlock, "--surface-elevated"),
  bgSecondary: token(darkBlock, "--bg-secondary"),
};

const lightSurfaces: Array<[string, string]> = [
  ["--background", light.background],
  ["--surface", light.surface],
  ["--surface-elevated", light.surfaceElevated],
  ["--bg-secondary", light.bgSecondary],
];

const darkSurfaces: Array<[string, string]> = [
  ["--background", dark.background],
  ["--surface", dark.surface],
  ["--surface-elevated", dark.surfaceElevated],
  ["--bg-secondary", dark.bgSecondary],
];

/* -------------------------------------------------------------------------- */

describe("B01: semantic CTA pair (accent fill + on-accent label)", () => {
  it("wires the utilities to the tokens instead of literals", () => {
    expect(themeBlock).toMatch(/--color-accent:\s*var\(--accent\)/);
    expect(themeBlock).toMatch(/--color-accent-foreground:\s*var\(--accent-foreground\)/);
    expect(themeBlock).toMatch(/--color-accent-text:\s*var\(--accent-text\)/);
  });

  it("light: white label on --accent and on its hover fill clears 4.5:1", () => {
    expect(contrast(light.onAccent, light.accent)).toBeGreaterThanOrEqual(TEXT_AA);
    expect(contrast(light.onAccent, light.accentHover)).toBeGreaterThanOrEqual(TEXT_AA);
  });

  it("dark: white label on --accent and on its hover fill clears 4.5:1", () => {
    // The B01 defect: dark --accent was #CC5200, whose BEST possible foreground
    // (white) is 4.40:1 — structurally below AA for every `bg-accent` +
    // `text-white` / `text-accent-foreground` CTA. The token now carries the
    // label itself (5.18:1); --accent-hover keeps a darker hover (5.50:1).
    expect(contrast(dark.onAccent, dark.accent)).toBeGreaterThanOrEqual(TEXT_AA);
    expect(contrast(dark.onAccent, dark.accentHover)).toBeGreaterThanOrEqual(TEXT_AA);
    expect(luminance(dark.accentHover)).toBeLessThan(luminance(dark.accent));
  });

  it("both themes keep one orange identity for the 10% accent slot", () => {
    expect(light.accent).toBe(dark.accent);
    expect(light.onAccent).toBe(dark.onAccent);
  });
});

describe("B01: orange text on a surface (--accent-text)", () => {
  it("light clears 4.5:1 on every light surface", () => {
    for (const [name, bg] of lightSurfaces) {
      expect(contrast(light.accentText, bg), `light --accent-text on ${name}`).toBeGreaterThanOrEqual(
        TEXT_AA,
      );
    }
  });

  it("dark clears 4.5:1 on every dark surface", () => {
    for (const [name, bg] of darkSurfaces) {
      expect(contrast(dark.accentText, bg), `dark --accent-text on ${name}`).toBeGreaterThanOrEqual(
        TEXT_AA,
      );
    }
  });

  it("a single hue cannot be both the white-label fill and dark-surface text", () => {
    // This is why the roles are split into two tokens rather than one "orange".
    // White-on-fill needs a LOW luminance; orange text on the dark canvas needs
    // a HIGH one. For this stylesheet's real tokens the window is empty.
    const maxLumForWhiteLabel = 1.05 / TEXT_AA - 0.05;
    const minLumForTextOnDarkCanvas = TEXT_AA * (luminance(dark.background) + 0.05) - 0.05;
    expect(minLumForTextOnDarkCanvas).toBeGreaterThan(maxLumForWhiteLabel);
  });
});

describe("B01: keyboard focus ring", () => {
  it("clears 3:1 against every surface of its theme", () => {
    for (const [name, bg] of lightSurfaces) {
      expect(contrast(light.ring, bg), `light --ring on ${name}`).toBeGreaterThanOrEqual(NONTEXT_AA);
    }
    for (const [name, bg] of darkSurfaces) {
      expect(contrast(dark.ring, bg), `dark --ring on ${name}`).toBeGreaterThanOrEqual(NONTEXT_AA);
    }
  });

  it("is not gated behind a fine-pointer media query", () => {
    // A phone/tablet with a hardware keyboard is a real keyboard workflow;
    // SC 2.4.7 has no pointer exception.
    expect(css).not.toMatch(/@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/);
    expect(css).toMatch(/\*:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-ring\)/);
    expect(css).toMatch(/\*:focus-visible\s*\{[^}]*outline-offset:\s*2px/);
  });

  it("cannot be deleted by a component-level outline reset", () => {
    const focus = /\*:focus-visible\s*\{([^}]*)\}/.exec(css);
    expect(focus).not.toBeNull();
    expect(focus?.[1]).toContain("!important");
  });
});

describe("B01: decorative / legacy orange is never a text-bearing token", () => {
  const decorative = {
    brandMark: "#FF6600", // brand vibrant orange — 2.94:1 on white
    specHeader: "#EF6124", // stale spec-era header colour
    darkGradientStops: ["#CC5200", "#B34700", "#9A3412"],
  };

  it("no decorative orange is the value of a CTA-fill or orange-text token", () => {
    const forbidden = [decorative.brandMark, decorative.specHeader, ...decorative.darkGradientStops];
    const forbiddenLower = forbidden.map((f) => f.toLowerCase());
    // --accent-hover is excluded on purpose: it is a fill (its bar is the white
    // label on it, asserted above), not orange text painted on a surface.
    // --ring is excluded on purpose too: it is a non-text indicator (3:1 bar),
    // and dark --ring deliberately shares #CC5200 with the gradient stops.
    const textBearing = ["--accent", "--accent-foreground", "--accent-text"] as const;
    for (const block of [rootBlock, darkBlock]) {
      for (const name of textBearing) {
        expect(
          forbiddenLower,
          `${name} must stay out of the decorative family`,
        ).not.toContain(token(block, name).toLowerCase());
      }
    }
  });

  it("records why the brand mark cannot carry text (the audit baseline)", () => {
    expect(contrast(decorative.brandMark, light.surface)).toBeLessThan(TEXT_AA);
    expect(contrast("#FFFFFF", decorative.brandMark)).toBeLessThan(TEXT_AA);
  });

  it("dark #CC5200 is focus-ring/decorative grade, not body-text grade", () => {
    // Kept as --ring in dark because it is the strongest orange for the 3:1
    // non-text bar, and explicitly barred from body copy on --surface.
    expect(contrast(dark.ring, dark.surface)).toBeGreaterThanOrEqual(NONTEXT_AA);
    expect(contrast(dark.ring, dark.surface)).toBeLessThan(TEXT_AA);
  });
});

describe("B01: strict 60-30-10 anchors stay in place", () => {
  it("light theme keeps canvas / brand / accent anchors", () => {
    expect(light.background).toBe("#F5F5F5");
    expect(token(rootBlock, "--primary")).toBe("#0E4825");
    expect(light.accent).toBe("#C2410C");
  });

  it("dark theme keeps canvas / brand / accent anchors", () => {
    expect(dark.background).toBe("#0A0A0A");
    expect(token(darkBlock, "--primary")).toBe("#0E4825");
    expect(dark.accent).toBe("#C2410C");
  });
});

describe("B01: parent-owned invariants preserved by this lane", () => {
  it("horizontal overflow stays clipped without a body scrollport", () => {
    expect(css).toMatch(/overflow-x:\s*clip;/);
    expect(css).not.toMatch(/overflow:\s*hidden\s*;/);
  });

  it("route transitions keep the no-fill-mode + will-change cleanup contract", () => {
    for (const selector of [".route-transition-push {", ".route-transition-pop {"]) {
      const body = ruleBody(selector);
      expect(body).toMatch(/animation:\s*nativeRoute(Push|Pop)\s+[\d.]+ms\s+cubic-bezier\([^)]*\)\s+none;/);
      expect(body).toMatch(/will-change:\s*transform, opacity;/);
    }
  });

  it("reduced motion still neutralises the containing block and shimmer", () => {
    const mediaAt = css.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(mediaAt).toBeGreaterThanOrEqual(0);
    const push = ruleBody(".route-transition-push", mediaAt, true);
    expect(push).toMatch(/animation:\s*none\s*!important/);
    expect(push).toMatch(/transform:\s*none\s*!important/);
    expect(push).toMatch(/will-change:\s*auto\s*!important/);
    expect(ruleBody(".skeleton", mediaAt)).toMatch(/animation:\s*none\s*!important/);
  });

  it("fixed-footer / safe-area helpers keep their clearances", () => {
    expect(ruleBody(".pb-tabs-safe")).toContain("calc(72px + env(safe-area-inset-bottom, 0px))");
    expect(ruleBody(".bottom-tabs-safe")).toContain("calc(72px + env(safe-area-inset-bottom, 0px))");
    expect(ruleBody(".pb-safe")).toContain("env(safe-area-inset-bottom, 0px)");
  });

  it("the phone-first shell and 16px input floor are untouched", () => {
    expect(ruleBody(".app-shell")).toContain("max-width: 480px");
    expect(css).toMatch(/input,\s*select,\s*textarea\s*\{\s*font-size:\s*16px;/);
  });
});
