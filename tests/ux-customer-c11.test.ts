import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * UX code audit 2026-11-26, CUSTOMER findings (commit a95f736).
 *
 * These pin the source-level contracts the audit says are missing. Component
 * behaviour that can be exercised (history back, document scroll lock) has its
 * own DOM tests; the rest assert the actual class/token/policy in the blob the
 * browser consumes, so a "fix" that only edits prose cannot pass.
 */
const ROOT = resolve(__dirname, "..");
const src = (relative: string) => readFileSync(resolve(ROOT, relative), "utf8");

describe("Customer UX audit — High", () => {
  it("H1: checkout's fixed total bar reserves the iPhone home indicator", () => {
    const checkout = src("src/routes/checkout.tsx");
    expect(checkout).toMatch(
      /fixed inset-x-0 bottom-0[^"]*pb-\[calc\(1rem\+env\(safe-area-inset-bottom,0px\)\)\]/,
    );
  });

  it("H1: the product page's other fixed bottom bar reserves it too", () => {
    const product = src("src/routes/menu.product.$productId.tsx");
    expect(product).toMatch(
      /fixed inset-x-0 bottom-0[^"]*pb-\[calc\(1rem\+env\(safe-area-inset-bottom,0px\)\)\]/,
    );
  });

  it("H2: the customizer lock owns the document scroller, not just body", () => {
    const lock = src("src/features/menu/utils/dialogA11y.ts");
    expect(lock).toContain('document.documentElement.style.overflow = "hidden"');
    expect(lock).toContain("previousHtmlOverflow");
  });
});

describe("Customer UX audit — Medium", () => {
  it("M7: motion durations come from three theme tokens", () => {
    const styles = src("src/styles.css");
    for (const token of [
      "--duration-fast: 200ms",
      "--duration-route: 300ms",
      "--duration-sheet: 300ms",
    ]) {
      expect(styles).toContain(token);
    }
    expect(styles).not.toMatch(/nativeRoutePop 250ms/);
    expect(src("src/components/ui/drawer.tsx")).not.toContain("duration-320");
    expect(src("src/components/ui/sheet.tsx")).not.toContain("duration-500");
  });

  it("M8: every motion child honours the OS reduced-motion setting", () => {
    expect(src("src/boot.tsx")).toContain('<MotionConfig reducedMotion="user">');
  });

  it("M9: cart steppers disable the tapped line while its write is in flight", () => {
    const cart = src("src/routes/cart.tsx");
    expect(cart).toMatch(/pendingLineIds/);
    expect(cart).toMatch(/onQuantityChange=\{\(q\) => void onQuantity\(line\.lineId, q\)\}/);
    const row = src("src/features/cart/components/CartItemRow.tsx");
    expect(row).toMatch(/quantityPending/);
    expect(row).toMatch(/disabled=\{unavailable \|\| quantityPending\}/);
  });

  it("M10: menu Add has a per-card busy state", () => {
    const card = src("src/features/menu/components/MenuProductCard.tsx");
    expect(card).toMatch(/addPending/);
    expect(card).toMatch(/disabled=\{disabled \|\| addPending\}/);
  });

  it("M11: search caps the first page and offers Load more", () => {
    const search = src("src/routes/search.tsx");
    expect(search).toMatch(/SEARCH_PAGE_SIZE = 30/);
    expect(search).toContain("Load more");
  });

  it("M12: iOS rubber-band cannot detach the fixed chrome", () => {
    const styles = src("src/styles.css");
    const htmlBlocks = Array.from(styles.matchAll(/(?:^|\n)\s*html\s*\{([^}]*)\}/g)).map(
      (match) => match[1],
    );
    expect(htmlBlocks.some((block) => block?.includes("overscroll-behavior-y: none"))).toBe(true);
    expect(styles).toMatch(
      /html,\s*\n\s*body,\s*\n\s*#app \{[^}]*background: var\(--color-background\)/,
    );
  });
});

describe("Customer UX audit — Low (demo-visible)", () => {
  it("L21: the empty cart uses the brand mascot, not a bare emoji", () => {
    const cart = src("src/routes/cart.tsx");
    expect(cart).toContain("<BrandMascot");
    expect(cart).not.toContain("📦");
  });

  it("L22: float-interactive does not pre-promote layers for its whole lifetime", () => {
    const utility = src("src/styles.css").match(/@utility float-interactive \{[\s\S]*?\n\}/)?.[0];
    expect(utility).toBeDefined();
    expect(utility).not.toMatch(/\n {2}will-change:/);
    expect(utility).toMatch(/will-change: transform, box-shadow;/);
  });

  it("L25: sticky sub-headers consume the measured top-chrome height", () => {
    for (const file of ["src/routes/search.tsx", "src/routes/offers.tsx"]) {
      const content = src(file);
      expect(content).toContain(
        "top-[var(--top-chrome-height,calc(3.5rem+env(safe-area-inset-top,0px)))]",
      );
      expect(content).not.toContain("top-[calc(3.5rem+env(safe-area-inset-top,0px))]");
    }
  });
});
