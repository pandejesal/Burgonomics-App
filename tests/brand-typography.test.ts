import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Owner's typography split (supersedes the earlier "MonstroSolid headings" pass):
 *   - MonstroSolid: ONLY the BURGONOMICS wordmark in the Home header.
 *   - Montserrat: every heading / display / title role.
 *   - Inter: body, controls, prices, metadata.
 * The wordmark is deliberately larger than the old 24px strip; 32px is the
 * floor at a 390px viewport and it must still fit at 320px without clipping.
 */

const css = readFileSync("src/styles.css", "utf8");
const brandHeader = readFileSync("src/features/home/components/BrandHeader.tsx", "utf8");

function block(selector: string): string {
  const pattern = new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{`);
  const match = pattern.exec(css);
  if (!match) throw new Error(`Missing ${selector} block`);
  const start = match.index + match[0].length;
  const end = css.indexOf("}", start);
  if (end < 0) throw new Error(`Unterminated ${selector} block`);
  return css.slice(start, end);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe("owner typography roles", () => {
  it("maps sans to Inter, display to Montserrat and brand to MonstroSolid", () => {
    const theme = block("@theme inline");
    expect(theme).toContain('--font-sans: "Inter"');
    expect(theme).toContain('--font-display: "Montserrat"');
    expect(theme).toContain('--font-brand: "MonstroSolid"');
    // --font-mono must be a real system monospace stack, not the display face.
    expect(theme).toMatch(/--font-mono:\s*ui-monospace/);
    expect(theme).not.toMatch(/--font-mono:\s*"Montserrat"/);
    expect(theme).not.toMatch(/--font-mono:\s*"Inter"/);
  });

  it("sets every heading element to Montserrat 700, not the brand face", () => {
    const headings = /h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6 \{([\s\S]*?)\}/.exec(css);
    expect(headings).not.toBeNull();
    expect(headings![1]).toContain("font-family: var(--font-display)");
    expect(headings![1]).toContain("font-weight: 700");
  });

  it.each([
    "type-display",
    "type-display-large",
    "type-display-medium",
    "type-headline-large",
    "type-headline-medium",
    "type-title-large",
    "type-title",
    "type-title-medium",
    "type-subheading",
  ])("keeps the %s heading role on Montserrat 700", (role) => {
    const roleBlock = block(`.${role}`);
    expect(roleBlock).toContain("font-family: var(--font-display)");
    expect(roleBlock).toContain("font-weight: 700");
  });

  it("keeps body, caption, button and price roles on Inter", () => {
    for (const role of ["type-body", "type-caption", "type-button", "type-price", "type-label-large"]) {
      expect(block(`.${role}`)).toContain("font-family: var(--font-sans)");
    }
    expect(block(".type-body")).toContain("font-weight: 400");
    expect(block(".type-price")).toContain("font-family: var(--font-sans)");
  });

  it("reserves type-brand-heading for the real wordmark only", () => {
    const brandRule = block(".type-brand-heading");
    expect(brandRule).toContain("font-family: var(--font-brand)");
    expect(brandRule).toContain("font-weight: 400");
    // No faux bold on a single-weight face.
    expect(brandRule).toMatch(/font-synthesis:\s*none/);

    const users = walk("src")
      .filter((file) => readFileSync(file, "utf8").includes("type-brand-heading"))
      .map((file) => relative("src", file).replace(/\\/g, "/"));
    expect(users).toEqual(["features/home/components/BrandHeader.tsx"]);
  });

  it("renders a noticeably larger wordmark that fits 320px without clipping", () => {
    // Advance width of "BURGONOMICS" in MonstroSolid.ttf, measured from the
    // shipped font (5706/1024 units per em), so layout math is not guessed.
    const WORDMARK_EM = 5.5723;
    const sizeMatch = /\.brand-wordmark \{[\s\S]*?font-size:\s*min\(([\d.]+)rem,\s*([\d.]+)vw\)/.exec(css);
    expect(sizeMatch).not.toBeNull();
    const sizePx = Number(sizeMatch![1]) * 16;
    expect(sizePx).toBeGreaterThanOrEqual(32);
    expect(sizePx).toBeLessThanOrEqual(36);
    // Enlarged text grows the wordmark only up to the vw cap, which must still
    // fit one line beside the mascot on a 320px phone.
    const capAt320 = (Number(sizeMatch![2]) / 100) * 320;
    expect(capAt320).toBeGreaterThanOrEqual(sizePx);
    expect(capAt320 * WORDMARK_EM + 40 + 8 + 32).toBeLessThanOrEqual(320);

    expect(brandHeader).toContain("brand-wordmark");
    expect(brandHeader).not.toMatch(/brand-wordmark[^"]*truncate/);
    expect(brandHeader).not.toMatch(/brand-wordmark[^"]*line-clamp/);
    // 320px budget: 16px page padding each side, 40px mascot, 8px gap. The
    // notification target keeps its own 44px and wraps to a second row when
    // the brand row cannot hold it — text is never cut to make room.
    const wordmarkLine = sizePx * WORDMARK_EM + 40 + 8 + 32;
    expect(wordmarkLine).toBeLessThanOrEqual(320);
    expect(brandHeader).toMatch(/flex min-h-11 flex-wrap/);
    // Never split mid-word: "BURGO / NOMIC / S" was seen at 200% text.
    expect(css).toMatch(/\.brand-wordmark \{[\s\S]*?white-space:\s*nowrap/);
    expect(brandHeader).not.toMatch(/brand-wordmark[^"]*break-words/);
    expect(brandHeader).toContain("h-11 w-11");
  });

  it("never lets a heading opt back into Inter with font-sans", () => {
    // h1-h6 get Montserrat in @layer base, so a font-sans utility on a heading
    // silently wins. The live check found product names rendering in Inter.
    const offenders = walk("src")
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .flatMap((file) =>
        [...readFileSync(file, "utf8").matchAll(/<h[1-6][^>]*className="[^"]*\bfont-sans\b/g)].map(
          () => relative("src", file).replace(/\\/g, "/"),
        ),
      );
    expect(offenders).toEqual([]);
  });

  it("keeps the non-brand Home headings on Montserrat roles", () => {
    for (const file of [
      "src/features/home/components/SectionHeader.tsx",
      "src/features/home/components/BannerCarousel.tsx",
      "src/features/home/components/UpcomingBranches.tsx",
      "src/features/home/components/HomeAnnouncements.tsx",
      "src/routes/home.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} still uses the brand face`).not.toContain("type-brand-heading");
      expect(source, `${file} has no Montserrat heading role`).toMatch(
        /type-(display|display-large|display-medium|headline-large|headline-medium|title-large|title|title-medium|subheading)/,
      );
    }
  });

  it("ships the real MonstroSolid and Montserrat assets, self-hosted", () => {
    expect(readFileSync("public/fonts/MonstroSolid.woff2").subarray(0, 4).toString()).toBe("wOF2");
    expect(readFileSync("public/fonts/MontserratVariable.woff2").subarray(0, 4).toString()).toBe(
      "wOF2",
    );
    expect(css).not.toContain("fonts.googleapis");
    expect(css).toContain('url("/fonts/MonstroSolid.woff2")');
  });
});
