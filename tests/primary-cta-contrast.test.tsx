/** @vitest-environment jsdom */
/**
 * R26 — primary CTA contrast fixture.
 *
 * Audit 05-01: the legacy `#FF6600` pair was 2.94:1 in both directions
 * (white on `#FF6600`, and `#FF6600` text on a light surface) — under the
 * 4.5:1 body-text bar of SC 1.4.3 and under the 3:1 control bar of SC 1.4.11.
 *
 * This suite does NOT count hex occurrences. It resolves the utility the
 * component actually renders → the `@theme inline` mapping in `src/styles.css`
 * → the `:root` / `.dark` token values → a WCAG 2.2 relative-luminance ratio,
 * in both themes, and additionally static-renders the two owned components to
 * confirm the class list they emit.
 *
 * Thresholds only — no WCAG conformance claim, no device/AT evidence.
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

// --- Hermetic collaborators (same set the owned components pull in) --------
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params: _params,
    className,
    children,
    ...rest
  }: {
    to: string;
    params?: Record<string, string>;
    className?: string;
    children?: React.ReactNode;
  }) => (
    <a href={String(to)} className={className} {...rest}>
      {children}
    </a>
  ),
}));
// NOTE: `tests/**` sits outside the tsconfig `include`, so the `@/*` alias does
// not resolve here — mock and import ids are relative on purpose. They still
// key on the same absolute file the source modules import.
vi.mock("../src/features/favorites/components/FavoriteHeart", () => ({
  FavoriteHeart: () => null,
}));
vi.mock("../src/features/cart/repositories/CartRepository", () => ({
  cartRepository: { updateQuantity: vi.fn(), removeLine: vi.fn() },
}));
vi.mock("../src/core/services/haptics", () => ({
  HapticService: { impact: vi.fn(), light: vi.fn(), selection: vi.fn() },
}));
vi.mock("../src/core/services/audio", () => ({
  AudioService: { playClick: vi.fn() },
}));
vi.mock("../src/features/addresses/repositories/AddressRepository", () => ({
  addressRepository: {
    update: vi.fn(async () => ({ success: true })),
    create: vi.fn(),
  },
}));
vi.mock("../src/features/stores/hooks/useLocationPermission", () => ({
  useLocationPermission: () => ({
    request: vi.fn(),
    coords: null,
    status: "unavailable",
    isLoading: false,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: React.forwardRef(() => null),
  useMap: () => ({ flyTo: vi.fn(), getZoom: () => 16 }),
  useMapEvents: vi.fn(),
}));

import { MenuProductCard } from "../src/features/menu/components/MenuProductCard";
import { AddressFormModal } from "../src/features/profile/components/AddressFormModal";
import type { Product } from "../src/features/menu/models";

// ---------------------------------------------------------------------------
// WCAG 2.2 relative luminance / contrast (SC 1.4.3, SC 1.4.11)
// ---------------------------------------------------------------------------

const TEXT_AA = 4.5; // SC 1.4.3 Contrast (Minimum), AA, non-large text
const NONTEXT_AA = 3; // SC 1.4.11 Non-text Contrast, AA (controls/focus)

function srgbChannel(value8bit: number): number {
  const c = value8bit / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Channel-space `brightness()` — the conservative model for white-on-accent:
 *  the sRGB model lifts the background more than the linearRGB model, so it
 *  yields the lower (safer) ratio. White clamps to #FFFFFF either way. */
function brightness(hex: string, factor: number): string {
  const raw = hex.replace("#", "");
  const ch = (i: number) => Math.min(255, Math.round(parseInt(raw.slice(i, i + 2), 16) * factor));
  return `#${[ch(0), ch(2), ch(4)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// ---------------------------------------------------------------------------
// Tokens — read from the shipped stylesheet, never hard-coded
// ---------------------------------------------------------------------------

/** Locate an app source file whether the runner was started from the app root
 *  or from the workspace root — vitest gives no usable `file://` import.meta.url. */
function repoFile(rel: string): string {
  const candidates = [
    resolve(process.cwd(), rel),
    resolve(process.cwd(), "burgonomics-foundation-core", rel),
  ];
  const hit = candidates.find((c) => existsSync(c));
  if (!hit) throw new Error(`R26 fixture: cannot locate ${rel} under ${process.cwd()}`);
  return hit;
}

const stylesCss = readFileSync(repoFile("src/styles.css"), "utf8");

function cssBlock(selector: string): string {
  const start = stylesCss.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`src/styles.css: missing "${selector} {" block`);
  const end = stylesCss.indexOf("}", start);
  return stylesCss.slice(start, end);
}

function tokenHex(block: string, name: string): string {
  const m = block.match(new RegExp(`(?:^|[;\\s])${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`));
  if (!m) throw new Error(`src/styles.css: ${name} is not a hex token`);
  return m[1];
}

const rootBlock = cssBlock(":root");
const darkBlock = cssBlock(".dark");
const themeBlock = cssBlock("@theme inline");

const light = {
  accent: tokenHex(rootBlock, "--accent"),
  accentHover: tokenHex(rootBlock, "--accent-hover"),
  onAccent: tokenHex(rootBlock, "--accent-foreground"),
  surface: tokenHex(rootBlock, "--surface"),
  background: tokenHex(rootBlock, "--background"),
  ring: tokenHex(rootBlock, "--ring"),
};
const dark = {
  accent: tokenHex(darkBlock, "--accent"),
  accentHover: tokenHex(darkBlock, "--accent-hover"),
  onAccent: tokenHex(darkBlock, "--accent-foreground"),
  surface: tokenHex(darkBlock, "--surface"),
  background: tokenHex(darkBlock, "--background"),
  ring: tokenHex(darkBlock, "--ring"),
};

describe("R26: primary CTA token resolution", () => {
  it("maps the accent utilities to the semantic tokens, not to literals", () => {
    // `@theme inline` makes Tailwind emit `var(--accent)` /
    // `var(--accent-foreground)` for bg-accent / text-accent-foreground, so the
    // classes the components render provably resolve to the tokens below.
    expect(themeBlock).toMatch(/--color-accent:\s*var\(--accent\)/);
    expect(themeBlock).toMatch(/--color-accent-foreground:\s*var\(--accent-foreground\)/);
    expect(rootBlock).toContain("--accent:");
    expect(darkBlock).toContain("--accent:");
  });

  it("keeps both themes on the accent pair the CTA uses", () => {
    for (const [label, t] of [
      ["light", light],
      ["dark", dark],
    ] as const) {
      expect(t.accent, `${label} --accent`).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(t.accentHover, `${label} --accent-hover`).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(t.onAccent, `${label} --accent-foreground`).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("documents why the legacy pair was replaced", () => {
    // Audit 05-01 baseline: both directions of #FF6600/white were 2.94:1.
    expect(contrast("#FFFFFF", "#FF6600")).toBeLessThan(TEXT_AA);
    expect(contrast("#FF6600", "#FFFFFF")).toBeLessThan(TEXT_AA);
    expect(contrast("#FF6600", "#F0F3F1")).toBeLessThan(NONTEXT_AA);
  });
});

describe("R26: light theme contrast thresholds", () => {
  it("fills (Save Address, quantity stepper, ADD hover) clear 4.5:1", () => {
    // accent-foreground label on accent fill
    expect(contrast(light.onAccent, light.accent)).toBeGreaterThanOrEqual(TEXT_AA);
    // hover shade of the same fill
    expect(contrast(light.onAccent, light.accentHover)).toBeGreaterThanOrEqual(TEXT_AA);
  });

  it("outlined ADD label on --surface clears 4.5:1 and its border 3:1", () => {
    expect(contrast(light.accent, light.surface)).toBeGreaterThanOrEqual(TEXT_AA);
    expect(contrast(light.accent, light.surface)).toBeGreaterThanOrEqual(NONTEXT_AA);
  });

  it("keyboard focus ring clears 3:1 against the page background", () => {
    expect(contrast(light.ring, light.background)).toBeGreaterThanOrEqual(NONTEXT_AA);
    expect(contrast(light.ring, light.surface)).toBeGreaterThanOrEqual(NONTEXT_AA);
  });
});

describe("R26: dark theme contrast thresholds", () => {
  it("fills (Save Address, quantity stepper, ADD hover) clear 4.5:1", () => {
    // --accent-hover stays the hover fill (5.50:1). B01 also lifted the resting
    // fill: dark --accent is #C2410C (5.18:1), not #CC5200 (4.40:1).
    expect(contrast(dark.onAccent, dark.accentHover)).toBeGreaterThanOrEqual(TEXT_AA);
    expect(contrast(dark.onAccent, dark.accent)).toBeGreaterThanOrEqual(TEXT_AA);
  });

  it("outlined ADD label on --surface clears 4.5:1 and its border 3:1", () => {
    expect(contrast(dark.onAccent, dark.surface)).toBeGreaterThanOrEqual(TEXT_AA);
    expect(contrast(dark.accent, dark.surface)).toBeGreaterThanOrEqual(NONTEXT_AA);
  });

  it("keyboard focus ring clears 3:1 against the page background", () => {
    expect(contrast(dark.ring, dark.background)).toBeGreaterThanOrEqual(NONTEXT_AA);
    expect(contrast(dark.ring, dark.surface)).toBeGreaterThanOrEqual(NONTEXT_AA);
  });

  it("dark --accent is a fill token, not body text on --surface (accent-text owns that role)", () => {
    // B01 flipped the original assertion here, exactly as the previous comment
    // required: dark --accent is #C2410C, so the white on-accent label clears
    // 4.5:1 (5.18:1). The `dark:` overrides in AddressFormModal/MenuProductCard
    // now reinforce rather than rescue; they are harmless and were left alone
    // (component files are outside B01 ownership). Orange TEXT on dark surfaces
    // is --accent-text (#FF802B, 6.94:1 on --surface) — covered by
    // tests/token-accessibility.test.ts.
    expect(contrast(dark.onAccent, dark.accent)).toBeGreaterThanOrEqual(TEXT_AA);
    expect(contrast(dark.accent, dark.surface)).toBeLessThan(TEXT_AA);
  });

  it("dark Save hover (brightness(1.1)) still clears 4.5:1", () => {
    expect(contrast(brightness(dark.accentHover, 1.1), dark.onAccent)).toBeGreaterThanOrEqual(
      TEXT_AA,
    );
  });
});

// ---------------------------------------------------------------------------
// Static render — the class lists the owned components actually emit
// ---------------------------------------------------------------------------

const ownedSources = {
  menuCard: readFileSync(repoFile("src/features/menu/components/MenuProductCard.tsx"), "utf8"),
  addressModal: readFileSync(
    repoFile("src/features/profile/components/AddressFormModal.tsx"),
    "utf8",
  ),
};

function classesOf(tag: string): string[] {
  return (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/).filter(Boolean);
}

const product: Product = {
  id: "prod_classic_smash",
  categoryId: "cat_burgers",
  name: "Classic Smash Burger",
  description: "Double patty, cheddar & pickles",
  price: 299,
  veg: true,
  inStock: true,
};

describe("R26: MenuProductCard static render", () => {
  for (const layout of ["row", "grid"] as const) {
    it(`${layout} ADD button renders semantic accent classes only`, () => {
      const html = renderToStaticMarkup(<MenuProductCard product={product} layout={layout} />);
      const addTag = (html.match(/<button\b[^>]*>/g) ?? []).find((t) =>
        t.includes('aria-label="Add '),
      );
      expect(addTag, "ADD button tag").toBeDefined();
      const classes = classesOf(addTag!);

      // resting state
      expect(classes).toContain("border-accent");
      expect(classes).toContain("text-accent");
      expect(classes).toContain("dark:text-accent-foreground");
      expect(classes).toContain("bg-surface");
      // hover state
      expect(classes).toContain("hover:bg-accent");
      expect(classes).toContain("hover:text-accent-foreground");
      expect(classes).toContain("dark:hover:bg-[var(--accent-hover)]");
      // legacy pair gone
      expect(classes.join(" ")).not.toMatch(/\[#FF6600\]/);
      // layout/behaviour classes untouched
      expect(classes).toContain("active:scale-[0.95]");
      expect(classes).toContain("disabled:opacity-40");
    });
  }

  it("no legacy #FF6600 utility survives anywhere in the owned card source", () => {
    expect(ownedSources.menuCard).not.toMatch(/\[#FF6600\]/);
    // quantity stepper + series badge use the same filled pair as the CTA
    expect(ownedSources.menuCard).toMatch(
      /bg-accent dark:bg-\[var\(--accent-hover\)\] text-accent-foreground/,
    );
    expect(ownedSources.menuCard).toMatch(
      /"bg-accent dark:bg-\[var\(--accent-hover\)\] text-accent-foreground border-accent\/40"/,
    );
  });
});

describe("R26: AddressFormModal static render", () => {
  it("Save Address renders the semantic accent pair", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<AddressFormModal isOpen onClose={vi.fn()} />));

    const save = document.querySelector<HTMLButtonElement>("button[type=submit]");
    expect(save, "primary Save CTA").toBeTruthy();
    const classes = (save!.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

    expect(classes).toContain("bg-accent");
    expect(classes).toContain("dark:bg-[var(--accent-hover)]");
    expect(classes).toContain("text-accent-foreground");
    expect(classes).toContain("hover:bg-[var(--accent-hover)]");
    expect(classes).toContain("dark:hover:brightness-110");
    expect(classes.join(" ")).not.toMatch(/\[#FF6600\]/);
    expect(classes).toContain("min-h-[44px]");
    expect(save!.textContent).toBe("Save Address");

    await act(async () => root.unmount());
    host.remove();
  });

  it("no legacy #FF6600 utility survives anywhere in the owned modal source", () => {
    expect(ownedSources.addressModal).not.toMatch(/\[#FF6600\]/);
    expect(ownedSources.addressModal).toMatch(
      /bg-accent dark:bg-\[var\(--accent-hover\)\] text-accent-foreground hover:bg-\[var\(--accent-hover\)\] dark:hover:brightness-110/,
    );
    // R11's keyboard-focus reveal contract is untouched by R26.
    expect(ownedSources.addressModal).toMatch(/revealFocusedField/);
    expect(ownedSources.addressModal).toMatch(/visualViewport/);
  });
});
